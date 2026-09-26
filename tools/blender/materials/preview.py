"""Renders a review image per material: a clean sphere and a weathered wall block, in Cycles.

    tools/blender/run.sh tools/blender/materials/preview.py [--only id1,id2] [--samples 128] [--out docs/art/materials]

Both objects use meter UVs, so the texture shows at its true physical scale (sphere radius 0.3 m, wall block
1.2 x 0.16 x 1.0 m with 6 mm bevels). The sphere is the material as authored (default tint, no wear or dirt);
the wall block shows the per-instance layers (a second tint preset when there is one, wear 0.7, dirt 0.6) so
edge wear on the bevels, cavity dirt and the gravity band at its foot can be reviewed. Lighting: Poly Haven
studio_small_09 HDRI plus a soft key light, AgX view transform.
"""

from __future__ import annotations

import math
import os
import sys

import bpy

from common import args, paths, render, scene
from common.nodes import new_material
from materials import library as lib

HDRI = paths.repo("assets", "cache", "polyhaven", "studio_small_09@2k", "studio_small_09_2k.hdr")


def backdrop() -> None:
    floor = scene.plane("Backdrop", (12.0, 12.0))
    back = scene.plane("BackdropWall", (12.0, 6.0))
    back.rotation_euler = (math.radians(90.0), 0.0, 0.0)
    back.location = (0.0, 1.6, 0.0)
    mat, nt = new_material("Backdrop")
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None) or nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (0.18, 0.18, 0.18, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    floor.data.materials.append(mat)
    back.data.materials.append(mat)


def second_tint(e: dict):
    presets = list(e["params"].get("tint", {}).get("presets", {}))
    default = e["params"].get("tint", {}).get("default")
    others = [p for p in presets if p != default]
    return others[0] if others else default


def render_material(material_id: str, out_dir: str, samples: int) -> str:
    scene.reset()
    render.cycles(samples=samples, resolution=(1280, 640))
    render.hdri_world(HDRI, strength=0.9, rotation_deg=40.0)
    render.area_light("Key", (-1.6, -2.2, 2.6), (0.0, 0.0, 0.5), power_w=260.0, size=1.4, color=(1.0, 0.97, 0.92))
    backdrop()

    sphere = scene.uv_sphere("Sphere", 0.3)
    sphere.location = (-0.62, 0.0, 0.0)
    lib.assign(sphere, material_id, wear=0.0, dirt=0.0, seed=1)

    wall = scene.box("Wall", (1.2, 0.16, 1.0), bevel=0.006)
    wall.location = (0.5, 0.2, 0.0)
    wall.rotation_euler = (0.0, 0.0, math.radians(-38.0))
    e = lib.entry(material_id)
    lib.assign(wall, material_id, tint=second_tint(e), wear=0.7, dirt=0.6, seed=7)

    render.camera((0.05, -3.0, 1.45), (0.0, 0.15, 0.42), lens_mm=45.0)
    path = os.path.join(out_dir, f"{material_id}.png")
    render.still(path)
    return path


def main() -> None:
    p = args.parser(__doc__)
    p.add_argument("--only", help="comma-separated material ids")
    p.add_argument("--samples", type=int, default=128)
    p.add_argument("--out", default="docs/art/materials")
    a = args.parse(p)
    out_dir = paths.ensure_dir(a.out if os.path.isabs(a.out) else paths.repo(*a.out.split("/")))
    if not os.path.exists(HDRI):
        sys.exit("studio_small_09 HDRI missing: run node tools/fetch-assets.mjs --verify")
    todo = a.only.split(",") if a.only else lib.ids()
    for mid in todo:
        path = render_material(mid, out_dir, a.samples)
        print(f"rendered {os.path.relpath(path, paths.ROOT)}", flush=True)


main()
