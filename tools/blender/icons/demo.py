"""Renders the parametric builders that the shipped icon set does not use, with the same rig, for the review sheet
docs/art/icons/builders-*.png (contact.mjs): a jar, a shipping carton, a pillow pack, a rice bowl and a stew pot.

    tools/blender/run.sh tools/blender/icons/demo.py --work tools/blender/icons/work

Review images only; nothing here ships.
"""

from __future__ import annotations

import os

import bpy

from common import args, paths, scene

from icons import containers, dishes, rig, shading

DEMOS = [
    ("jar", lambda s: containers.jar({"r": 42, "h": 118}, None, seed=s), {"yaw": -20}),
    ("carton", lambda s: containers.box({"w": 120, "d": 80, "h": 80, "tint": "kraft"}, "carton_marks", seed=s), {"yaw": -30}),
    ("pillow", lambda s: containers.pillow({"w": 180, "h": 240, "puff": 34}, "pillow_crisps", seed=s), {"yaw": -15, "tilt": 30}),
    ("bowl", lambda s: dishes.dish({"vessel": "bowl", "food": "rice", "d": 120, "h": 58}, "perfect", s), {"yaw": 0}),
    ("pot", lambda s: dishes.dish({"vessel": "pot", "food": "stew", "d": 160, "h": 95}, "perfect", s), {"yaw": -20}),
]


def main() -> None:
    p = args.parser(__doc__)
    p.add_argument("--work", required=True)
    a = args.parse(p)
    work = a.work if os.path.isabs(a.work) else paths.repo(*a.work.split("/"))
    shading.LABEL_DIR = os.path.join(work, "labels")
    out = paths.ensure_dir(os.path.join(work, "demo"))
    cfg = rig.load()
    for i, (name, build, pose) in enumerate(DEMOS):
        scene.reset()
        rig.setup(cfg)
        objs = build(20260923 + i)
        rig.pose_subject(objs, pose)
        rig.frame([ob for ob in bpy.context.scene.objects if ob.type == "MESH"], cfg)
        rig.still(os.path.join(out, f"{i + 1:02d}-{name}.png"))
        print(f"rendered demo {name}", flush=True)


main()
