#!/usr/bin/env python3
"""Composes the per-material preview renders into docs/art/materials/contact_sheet.png (labelled grid).

    tools/materials/.venv/bin/python tools/materials/contact_sheet.py
"""

from __future__ import annotations

import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def main() -> None:
    with open(os.path.join(ROOT, "assets", "materials", "library.json"), encoding="utf-8") as f:
        lib = json.load(f)
    cols, tw, th, label = 4, 640, 320, 22
    mats = [a for a in lib["assets"] if a["kind"] == "material"]
    rows = (len(mats) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * (th + label)), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    for i, m in enumerate(mats):
        x, y = (i % cols) * tw, (i // cols) * (th + label)
        im = Image.open(os.path.join(ROOT, m["meta"]["preview"])).convert("RGB").resize((tw, th), Image.LANCZOS)
        sheet.paste(im, (x, y + label))
        p = m["params"]
        text = f"{m['id'].split('/', 1)[1]}  ({p['family']}, {p['tier']}, {m['meta']['texelDensity']:.0f} px/m, {m['sources'][0].split('/')[0]})"
        draw.text((x + 6, y + 5), text, fill=(235, 235, 235))
    out = os.path.join(ROOT, "docs", "art", "materials", "contact_sheet.png")
    sheet.save(out, optimize=True)
    print(f"wrote {os.path.relpath(out, ROOT)}")


if __name__ == "__main__":
    main()
