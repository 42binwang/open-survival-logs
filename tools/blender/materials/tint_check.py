"""Assigns library materials with a known and an unknown tint preset and prints the outcome as JSON.

    tools/blender/run.sh tools/blender/materials/tint_check.py

tests/materials.test.js runs it: a known preset assigns, an unknown one raises UnknownTint (no silent white).
"""

from __future__ import annotations

import json

from common import scene
from materials import library as lib
from materials.tints import UnknownTint


def attempt(material: str, **kw) -> dict:
    plate = scene.plane("Plate", (0.5, 0.5))
    try:
        lib.assign(plate, material, **kw)
        return {"ok": True, "tint": list(plate["sl_tint"])}
    except UnknownTint as err:
        return {"ok": False, "error": str(err)}


scene.reset()
print("TINTCHECK " + json.dumps({
    "known": attempt("metal_brushed", tint="steel"),
    "unknown": attempt("metal_brushed", tint="brass"),
    "unknownSecondary": attempt("tile_ceramic", tint2="teal"),
    "hex": attempt("metal_brushed", tint="#c0c0c0"),
}))
