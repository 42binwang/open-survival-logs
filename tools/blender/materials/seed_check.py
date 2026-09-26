"""Renders one material at several instance seeds and prints their mean luminance and seed offsets as JSON.

    tools/blender/run.sh tools/blender/materials/seed_check.py [--material metal_brushed] [--seeds 0,1048576,4294967295]

tests/materials.test.js runs it: every seed must render like seed 0 (the variation offset wraps mod 1, so a large
seed changes only where the shared mask is sampled, never whether the material renders).
"""

from __future__ import annotations

import json
import math

import bpy

from common import args, render, scene
from materials import library as lib


def mean_luminance(path: str) -> float:
    img = bpy.data.images.load(path, check_existing=False)
    px = list(img.pixels)
    n = len(px) // 4
    total = 0.0
    for i in range(n):
        r, g, b = px[4 * i], px[4 * i + 1], px[4 * i + 2]
        total += 0.2126 * r + 0.7152 * g + 0.0722 * b
    bpy.data.images.remove(img)
    return total / n


def main() -> None:
    p = args.parser(__doc__)
    p.add_argument("--material", default="metal_brushed")
    p.add_argument("--seeds", default=f"0,{2**20},{2**32 - 1}")
    p.add_argument("--out", default="/tmp")
    p.add_argument("--device", default="CPU", choices=["CPU", "GPU"], help="Cycles device (the icon rig renders on the CPU)")
    a = args.parse(p)
    seeds = [int(s) for s in a.seeds.split(",")]
    results = []
    for seed in seeds:
        scene.reset()
        render.cycles(samples=16, resolution=(48, 48), denoise=False)
        bpy.context.scene.cycles.device = a.device
        bpy.context.scene.cycles.seed = 1
        render.area_light("Key", (0.0, -1.2, 1.6), (0.0, 0.0, 0.0), power_w=120.0, size=2.0)
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
        world.color = (0.3, 0.3, 0.3)
        plate = scene.plane("Plate", (0.6, 0.6))
        lib.assign(plate, a.material, seed=seed)
        render.camera((0.0, -0.9, 0.9), (0.0, 0.0, 0.0), lens_mm=50.0)
        path = f"{a.out}/sl_seed_check_{seed}.png"
        render.still(path)
        results.append({
            "seed": seed,
            "mean": mean_luminance(path),
            "offset": [plate.get("sl_seed_u"), plate.get("sl_seed_v")],
            "finite": all(math.isfinite(v) for v in (plate.get("sl_seed_u", 0.0), plate.get("sl_seed_v", 0.0))),
        })
    print("SEEDCHECK " + json.dumps({"material": a.material, "results": results}))


main()
