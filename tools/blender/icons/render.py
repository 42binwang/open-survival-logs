"""Renders icon subjects with the fixed rig.

    tools/blender/run.sh tools/blender/icons/render.py --work tools/blender/icons/work [--only 2115,2105] [--samples N]

For each catalog icon: an empty scene, the rig's render settings and world, the subject from its builder, posed by
catalog `pose` and set on the floor, then framed and lit by the rig and rendered to <work>/render/<id>.png
(256 x 256 RGBA, straight alpha, Khronos PBR Neutral view). The label art must already be in <work>/labels
(labels.mjs). Framing facts go to <work>/render/<id>.json.
"""

from __future__ import annotations

import json
import os
import sys
import time

import bpy

from common import args, paths, scene

from icons import rig, shading, subjects


def main() -> None:
    p = args.parser(__doc__)
    p.add_argument("--work", required=True)
    p.add_argument("--only", help="comma-separated config item ids")
    p.add_argument("--samples", type=int, help="override rig.json cycles.samples (previews only)")
    a = args.parse(p)
    work = a.work if os.path.isabs(a.work) else paths.repo(*a.work.split("/"))
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "catalog.json"), encoding="utf-8") as f:
        catalog = json.load(f)
    cfg = rig.load()
    if a.samples:
        cfg["cycles"]["samples"] = a.samples
    ids = [int(x) for x in a.only.split(",")] if a.only else [i["id"] for i in catalog["icons"]]
    known = {i["id"]: i for i in catalog["icons"]}
    missing = [i for i in ids if i not in known]
    if missing:
        sys.exit(f"not in catalog.json: {missing}")
    shading.LABEL_DIR = os.path.join(work, "labels")
    out_dir = paths.ensure_dir(os.path.join(work, "render"))
    for iid in ids:
        icon = known[iid]
        t0 = time.time()
        scene.reset()
        rig.setup(cfg)
        objs = subjects.build(icon, catalog["seed"])
        rig.pose_subject(objs, icon.get("pose", {}))
        meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
        facts = rig.frame(meshes, cfg)
        facts["materials"] = sorted({f"materials/{m.name[3:]}" for ob in meshes for m in ob.data.materials if m and m.name.startswith("SL_")})
        path = os.path.join(out_dir, f"{iid}.png")
        rig.still(path)
        facts["seconds"] = round(time.time() - t0, 2)
        with open(os.path.join(out_dir, f"{iid}.json"), "w", encoding="utf-8") as f:
            json.dump(facts, f, indent=1)
        print(f"rendered {iid} ({icon['builder']}) in {facts['seconds']} s", flush=True)


main()
