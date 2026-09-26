"""Mesh fingerprint for the asset-lock check: renders a glTF from two fixed views with Workbench.

    tools/blender/run.sh tools/asset-lock/render_mesh.py <in.glb|in.gltf> <out>   writes <out>.0.png and <out>.1.png

Views: the game camera direction (pitch 40 deg, yaw 30 deg, src/contracts/look.js) and the opposite side, each an
orthographic 256 x 256 frame fitted to the bounding box, textured studio shading on a transparent background, 8
anti-aliasing samples. Workbench has no random sampling, so the same file renders the same pixels.

Blender's glTF importer refuses files that list KHR_texture_basisu in extensionsRequired (it cannot decode KTX2). A
.glb that requires it is imported from a temporary copy whose JSON chunk drops the extension from extensionsRequired
(it stays in extensionsUsed): the geometry is fingerprinted, the KTX2 textures are skipped.
"""

import json
import math
import os
import struct
import sys
import tempfile

import bpy
from mathutils import Vector

SIZE = 256
PITCH = math.radians(40.0)
YAW = math.radians(30.0)


UNREADABLE = {"KHR_texture_basisu"}


def importable(src: str) -> str:
    """src, or a temporary copy of a .glb without the extensions Blender cannot read in extensionsRequired."""
    if not src.lower().endswith(".glb"):
        return src
    with open(src, "rb") as f:
        data = f.read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    json_len, json_type = struct.unpack_from("<II", data, 12)
    if magic != 0x46546C67 or version != 2 or json_type != 0x4E4F534A:
        return src
    doc = json.loads(data[20 : 20 + json_len])
    required = doc.get("extensionsRequired", [])
    if not UNREADABLE.intersection(required):
        return src
    kept = [e for e in required if e not in UNREADABLE]
    if kept:
        doc["extensionsRequired"] = kept
    else:
        doc.pop("extensionsRequired")
    chunk = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    chunk += b" " * (-len(chunk) % 4)
    rest = data[20 + json_len :]
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(chunk) + len(rest)) + struct.pack("<II", len(chunk), 0x4E4F534A) + chunk + rest
    fd, path = tempfile.mkstemp(suffix=".glb")
    with os.fdopen(fd, "wb") as f:
        f.write(out)
    return path


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :]
    src, out = argv[0], argv[1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = importable(src)
    try:
        bpy.ops.import_scene.gltf(filepath=path)
    finally:
        if path != src:
            os.remove(path)
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"{src}: no meshes")
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 1e-3)

    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.render_aa = "8"
    scene.render.film_transparent = True
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"

    cam_data = bpy.data.cameras.new("fingerprint")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = radius * 2.2
    cam = bpy.data.objects.new("fingerprint", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    for side in (0, 1):
        yaw = YAW + math.pi * side
        # Blender is z-up: the game's east is +x, south is -y
        d = Vector((math.sin(yaw) * math.cos(PITCH), -math.cos(yaw) * math.cos(PITCH), math.sin(PITCH)))
        cam.location = center + d * radius * 4
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        cam_data.clip_start = radius * 0.5
        cam_data.clip_end = radius * 8
        scene.render.filepath = f"{out}.{side}.png"
        bpy.ops.render.render(write_still=True)


main()
