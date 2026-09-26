"""The fixed icon rig: Cycles settings, the studio world, the camera that frames a subject, and three-point light.

Everything comes from rig.json. The camera looks down at the game camera's pitch from the -Y side; subjects turn to
show their best face, the camera never moves relative to them except to fit them: its distance and lens shift are
solved so the subject's projected bounds fill `camera.fill` of the frame and sit in its centre. Lights are placed
around the subject in camera-relative directions at distances and sizes in units of the subject's bounding radius,
so every icon gets the same light whatever its real size.
"""

from __future__ import annotations

import json
import math
import os

import bpy
import numpy as np
from mathutils import Vector

from common import paths

HERE = os.path.dirname(os.path.abspath(__file__))


def load() -> dict:
    with open(os.path.join(HERE, "rig.json"), encoding="utf-8") as f:
        return json.load(f)


def setup(rig: dict) -> None:
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    c, cy = sc.cycles, rig["cycles"]
    if cy["device"] != "CPU":
        raise SystemExit("the icon rig renders on the CPU only (GPU output is not bit-stable across runs and machines)")
    c.device = "CPU"
    c.seed = cy["seed"]
    c.use_animated_seed = False
    c.samples = cy["samples"]
    c.use_adaptive_sampling = cy["adaptiveSampling"]
    c.use_denoising = True
    c.denoiser = cy["denoiser"]
    c.denoising_input_passes = cy["denoisingInputPasses"]
    c.denoising_prefilter = cy["denoisingPrefilter"]
    c.denoising_quality = cy["denoisingQuality"]
    c.denoising_use_gpu = False
    c.pixel_filter_type = cy["pixelFilter"]
    c.filter_width = cy["filterWidth"]
    c.max_bounces = cy["maxBounces"]
    c.transmission_bounces = cy["transmissionBounces"]
    c.transparent_max_bounces = cy["transparentMaxBounces"]
    c.sample_clamp_indirect = cy["clampIndirect"]
    c.caustics_reflective = cy["caustics"]
    c.caustics_refractive = cy["caustics"]
    c.film_transparent_glass = cy["transparentGlass"]
    c.film_transparent_roughness = cy["transparentGlassRoughness"]
    c.use_guiding = False
    sc.render.film_transparent = True
    res = rig["resolution"]
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.use_persistent_data = False
    col = rig["color"]
    sc.display_settings.display_device = "sRGB"
    sc.view_settings.view_transform = col["view"]
    sc.view_settings.look = col["look"]
    sc.view_settings.exposure = col["exposure"]
    sc.view_settings.gamma = 1.0
    sc.sequencer_colorspace_settings.name = "sRGB"
    world(rig["world"])


def world(w: dict) -> None:
    """The studio: a soft vertical gradient (bright overhead, dim horizon, dark floor) that metals and glass reflect,
    plus the locked studio HDRI at low strength for the small bright reflections a real room gives."""
    h = w["hdri"]
    path = paths.repo(*h["file"].split("/"))
    if not os.path.exists(path):
        raise SystemExit(f"{h['file']} is missing: run node tools/fetch-assets.mjs --verify --only {h['source']}")
    wd = bpy.data.worlds.new("IconWorld")
    bpy.context.scene.world = wd
    if wd.node_tree is None:
        wd.use_nodes = True
    nt = wd.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(h["rotationDeg"]))
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(path, check_existing=True)
    env.interpolation = "Linear"
    nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    g = w["gradient"]
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "EASE"
    stops = [(0.0, g["nadir"]), (0.5, g["horizon"]), (0.62, g["horizon"] * 1.15), (1.0, g["zenith"])]
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    tint = g["color"]
    for el, (pos, v) in zip(cr.elements, stops):
        el.position = pos
        el.color = (v * tint[0], v * tint[1], v * tint[2], 1.0)
    remap = nt.nodes.new("ShaderNodeMapRange")
    remap.inputs["From Min"].default_value = -1.0
    remap.inputs["From Max"].default_value = 1.0
    nt.links.new(sep.outputs["Z"], remap.inputs["Value"])
    nt.links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    hdri_scaled = nt.nodes.new("ShaderNodeMix")
    hdri_scaled.data_type = "RGBA"
    hdri_scaled.blend_type = "ADD"
    hdri_scaled.inputs[0].default_value = h["strength"] / max(g["strength"], 1e-6)
    nt.links.new(ramp.outputs["Color"], hdri_scaled.inputs[6])
    nt.links.new(env.outputs["Color"], hdri_scaled.inputs[7])
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = g["strength"]
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(hdri_scaled.outputs[2], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def pose_subject(objs: list, pose: dict) -> None:
    """Turns the subject as a whole: spin about its own vertical axis, roll onto its side (about Y), tilt towards the
    camera (about X), then yaw (about Z); finally sets its lowest point on the floor."""
    from mathutils import Matrix

    from . import shapes

    root = shapes.parent_all([ob for ob in objs if ob.parent is None])
    root.matrix_world = (Matrix.Rotation(math.radians(pose.get("yaw", 0.0)), 4, "Z") @ Matrix.Rotation(math.radians(pose.get("tilt", 0.0)), 4, "X")
                         @ Matrix.Rotation(math.radians(pose.get("roll", 0.0)), 4, "Y") @ Matrix.Rotation(math.radians(pose.get("spin", 0.0)), 4, "Z"))
    shapes.rest_on_floor([ob for ob in bpy.context.scene.objects if ob.type == "MESH"], root)


def subject_points(objs: list) -> np.ndarray:
    """World-space vertices of the evaluated (modifiers applied) meshes of the subject."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in objs:
        if ob.type != "MESH" or ob.hide_render:
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        n = len(me.vertices)
        if n:
            co = np.empty(n * 3, dtype=np.float64)
            me.vertices.foreach_get("co", co)
            co = co.reshape(n, 3)
            m = np.array(ev.matrix_world, dtype=np.float64)
            pts.append(co @ m[:3, :3].T + m[:3, 3])
        ev.to_mesh_clear()
    if not pts:
        raise RuntimeError("the subject has no mesh vertices")
    return np.concatenate(pts)


def _basis(pitch: float):
    """Camera forward / right / up for a camera on the -Y side looking down at `pitch`."""
    fwd = np.array([0.0, math.cos(pitch), -math.sin(pitch)])
    right = np.array([1.0, 0.0, 0.0])
    up = np.cross(right, fwd)
    return fwd, right, up


def frame(objs: list, rig: dict) -> dict:
    """Places the camera and the lights for the subject; returns the framing facts."""
    cam_cfg = rig["camera"]
    pts = subject_points(objs)
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    centre = (lo + hi) / 2
    radius = float(np.linalg.norm(pts - centre, axis=1).max())
    pitch = math.radians(cam_cfg["pitchDeg"])
    fwd, right, up = _basis(pitch)
    half = cam_cfg["sensorMm"] / (2 * cam_cfg["lensMm"])  # tan of the half field of view (square frame)
    target = cam_cfg["fill"] * 2 * half
    dist = radius / half
    x = y = None
    for _ in range(12):
        cam = centre - fwd * dist
        q = pts - cam
        z = q @ fwd
        x, y = (q @ right) / z, (q @ up) / z
        extent = max(x.max() - x.min(), y.max() - y.min())
        dist *= extent / target
    cam = centre - fwd * dist
    q = pts - cam
    z = q @ fwd
    x, y = (q @ right) / z, (q @ up) / z
    cx, cy = (x.max() + x.min()) / 2, (y.max() + y.min()) / 2

    data = bpy.data.cameras.new("IconCamera")
    data.lens = cam_cfg["lensMm"]
    data.sensor_width = cam_cfg["sensorMm"]
    data.sensor_fit = "HORIZONTAL"
    data.shift_x = cx / (2 * half)
    data.shift_y = cy / (2 * half)
    data.clip_start = max(dist - 2 * radius, 1e-3) * 0.5
    data.clip_end = dist + 4 * radius
    ob = bpy.data.objects.new("IconCamera", data)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = Vector(cam.tolist())
    ob.rotation_euler = Vector(fwd.tolist()).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = ob

    for name, cfg in rig["lights"].items():
        az, el = math.radians(cfg["azimuthDeg"]), math.radians(cfg["elevationDeg"])
        d = cfg["distance"] * radius
        direction = np.array([math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)])
        pos = centre + direction * d
        light = bpy.data.lights.new(f"Icon{name.title()}", "AREA")
        light.shape = "DISK"
        light.size = cfg["size"] * radius
        light.energy = cfg["power"] * d * d
        light.color = cfg["color"]
        light.use_shadow = True
        lo_ = bpy.data.objects.new(f"Icon{name.title()}", light)
        bpy.context.scene.collection.objects.link(lo_)
        lo_.location = Vector(pos.tolist())
        lo_.rotation_euler = Vector((centre - pos).tolist()).to_track_quat("-Z", "Y").to_euler()
    return {
        "radiusM": round(radius, 4),
        "distanceM": round(float(dist), 4),
        "boundsM": [[round(float(v), 4) for v in lo], [round(float(v), 4) for v in hi]],
        "extent": [round(float(x.max() - x.min()) / (2 * half), 4), round(float(y.max() - y.min()) / (2 * half), 4)],
    }


def still(path: str) -> None:
    sc = bpy.context.scene
    s = sc.render.image_settings
    s.file_format = "PNG"
    s.color_mode = "RGBA"
    s.color_depth = "8"
    s.compression = 15
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
