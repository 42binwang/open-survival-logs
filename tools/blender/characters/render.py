"""Stage 'render' (look development): turntable and close-up of the exported character in Cycles.

    Blender --background --factory-startup --python render.py -- <raw.glb> <out dir> <id>

The exported glTF is re-imported, so materials, skinning and clips are what the file carries (the shipped file only
adds KTX2 and meshopt quantization). Writes into <out dir>:
    <id>_turntable.jpg      eight views of the idle pose, 45 degrees apart (studio lights)
    <id>_closeup.jpg        head and shoulders, 85 mm

The game views (the shipped glb in three.js through the game camera, under the ART.md rigs) come from
render-three.mjs.
"""

import math
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import pipeline as common  # noqa: E402

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
def log(*a):
    print("[render]", *a, flush=True)


def kelvin(k):
    """Approximate linear RGB of a black body (Tanner Helland's fit), normalised to max 1."""
    t = k / 100.0
    r = 255 if t <= 66 else 329.698727446 * (t - 60) ** -0.1332047592
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * (t - 60) ** -0.0755148492
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    c = [max(0.0, min(255.0, x)) / 255.0 for x in (r, g, b)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    m = max(lin)
    return tuple(x / m for x in lin)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.render.fps = 30
    return scene


def import_character(glb, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    # the importer also adds an unparented bone-display shape (an icosphere at the origin); the armature and its
    # children are the character
    for o in new:
        if o is not arm and o.parent is None:
            bpy.data.objects.remove(o)
    arm.name = name
    return arm, arm


def clip_action(name):
    for a in bpy.data.actions:
        if a.name == name or a.name.startswith(name + "_") or a.name.startswith(name + "."):
            return a
    raise KeyError(f"no imported action for clip {name}: {[a.name for a in bpy.data.actions]}")


def play(arm, clip, cyclic=True):
    """Assigns a clip to an imported armature (cycled), with NLA tracks muted."""
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True
    act = clip_action(clip)
    ad.action = act
    if act.slots:
        ad.action_slot = act.slots[0]
    if cyclic:
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fc in bag.fcurves:
                        if not any(m.type == "CYCLES" for m in fc.modifiers):
                            fc.modifiers.new("CYCLES")
    return act


def area(name, loc, target, energy, size, kelvin_k=5500, shape="RECTANGLE", size_y=None):
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.shape = shape
    light.size = size
    if size_y:
        light.size_y = size_y
    light.color = kelvin(kelvin_k)
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return obj


def material(name, color, roughness, grid=None):
    """A plain dielectric; `grid` = (tile metres, line darkening) adds a faint tile grid (scale reference)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    lin = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (x / 255 for x in color))
    bsdf.inputs["Roughness"].default_value = roughness
    if not grid:
        bsdf.inputs["Base Color"].default_value = (*lin, 1)
        return m
    tile, dark = grid
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    lines = []
    for axis in (0, 1):
        mod = nt.nodes.new("ShaderNodeMath")
        mod.operation = "PINGPONG"
        mod.inputs[1].default_value = tile / 2
        nt.links.new(sep.outputs[axis], mod.inputs[0])
        edge = nt.nodes.new("ShaderNodeMath")
        edge.operation = "LESS_THAN"
        edge.inputs[1].default_value = 0.004
        nt.links.new(mod.outputs[0], edge.inputs[0])
        lines.append(edge)
    both = nt.nodes.new("ShaderNodeMath")
    both.operation = "MAXIMUM"
    nt.links.new(lines[0].outputs[0], both.inputs[0])
    nt.links.new(lines[1].outputs[0], both.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (*lin, 1)
    mix.inputs[7].default_value = (*(c * (1 - dark) for c in lin), 1)
    nt.links.new(both.outputs[0], mix.inputs[0])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return m


def plane(name, size, loc, rot, mat):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[1], 1)
    o.data.materials.append(mat)
    return o


def camera(name, lens=None, vfov=None):
    cam = bpy.data.cameras.new(name)
    if vfov:
        cam.sensor_fit = "VERTICAL"
        cam.angle_y = math.radians(vfov)
    if lens:
        cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = 100
    obj = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.scene.camera = obj
    return obj


def aim(cam, target):
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def save(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def ffmpeg(*args):
    subprocess.run([FFMPEG, "-loglevel", "error", "-y", *args], check=True)


# --------------------------------------------------------------------------------------------------- the renders


def studio(scene):
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.045, 0.047, 0.05, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    plane("floor", (30, 30), (0, 0, 0), (0, 0, 0), material("studio_floor", (118, 116, 112), 0.8))
    area("key", (2.6, -3.2, 3.4), (0, 0, 1.1), 150, 2.2, 5200)
    area("fill", (-3.4, -2.2, 1.6), (0, 0, 1.0), 45, 3.0, 6800)
    area("rim", (-0.8, 3.4, 2.8), (0, 0, 1.4), 90, 1.5, 6000)


def turntable(glb, out, cid):
    scene = reset()
    studio(scene)
    _, arm = import_character(glb, cid)
    play(arm, "idle")
    scene.frame_set(0)
    common.setup_cycles(96, denoise=True)
    scene.render.resolution_x, scene.render.resolution_y = 600, 1000
    scene.render.image_settings.file_format = "PNG"
    cam = camera("turntable", lens=55)
    tmp = tempfile.mkdtemp()
    frames = []
    for i in range(8):
        a = math.radians(i * 45)
        cam.location = (4.6 * math.sin(a), -4.6 * math.cos(a), 1.05)
        aim(cam, (0, 0, 0.9))
        frames.append(save(scene, os.path.join(tmp, f"t{i}.png")))
    path = os.path.join(out, f"{cid}_turntable.jpg")
    ffmpeg(*sum((["-i", f] for f in frames), []), "-filter_complex", "".join(f"[{i}]" for i in range(8)) + "xstack=inputs=8:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0",
           "-q:v", "3", path)
    log("wrote", os.path.relpath(path, common.ROOT))

    # close-up: head and shoulders, three-quarter view, framed on the posed head joint
    scene.render.resolution_x, scene.render.resolution_y = 1200, 1200
    cam.data.lens = 85
    head = arm.matrix_world @ arm.pose.bones["head"].head
    target = head + Vector((0.0, 0.0, -0.02))
    cam.location = target + Vector((0.72, -1.3, 0.1))
    aim(cam, target)
    tmpc = save(scene, os.path.join(tmp, "close.png"))
    path = os.path.join(out, f"{cid}_closeup.jpg")
    ffmpeg("-i", tmpc, "-q:v", "3", path)
    log("wrote", os.path.relpath(path, common.ROOT))
    shutil.rmtree(tmp)


def main():
    glb, out, cid = common.script_args()[:3]
    os.makedirs(out, exist_ok=True)
    turntable(glb, out, cid)


if __name__ == "__main__":
    main()
