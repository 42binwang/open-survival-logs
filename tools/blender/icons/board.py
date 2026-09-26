"""Review board for the icon set (WP-P0-12): source inventory icons next to ours at the same on-screen pixel size, and
the measurements the art review uses, on the same terms for both.

    python3 tools/blender/icons/board.py [--out docs/art/icons]

Needs Pillow and numpy (the tools/materials/requirements.txt pins). Source crops come from the Steam screenshots
(native 1920 x 1080 game pixels) and trailer frames (the game frame scaled by 0.90625, docs/ART.md; rescaled back) in
assets/targets/source/, which are look reference only: they appear in this review image, never in an asset. Ours
sit in a slot of the source crop's size and slot colour, using the file the UI would pick (64 or 128 at 1:1, else
the 256 master resampled). The crop list and the measurements follow the WP-P0-12 review 1 boards.

Writes review-side-by-side-1x.png, review-side-by-side-3x-p<n>.png, review-inventory.png and review-stats.json.
"""

from __future__ import annotations

import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC = os.path.join(ROOT, "assets", "targets", "source")
OURS = os.path.join(ROOT, "assets", "icons")
TRAILER = 1 / 0.90625
S, T = "screenshots/", "trailer/"


def font(size, bold=False):
    for f in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


PAIRS = [
    ("Instant noodles 2105 [2x2]", S + "ss_01_8f2609d8.jpg", (804, 376, 937, 509), False, 2105, "ss_01 Beef Noodles, inventory 2x2"),
    ("Instant noodles 2105 [2x2]", T + "shot_14_t023.567s.jpg", (129, 393, 251, 514), True, 2105, "shot_14 Seafood Noodles 2x2"),
    ("Rice 2103 [3x4]", S + "ss_01_8f2609d8.jpg", (384, 446, 586, 720), False, 2103, "ss_01 Organic Fragrant Rice 3x4 (same item)"),
    ("Water 2142 [1x2]", S + "ss_01_8f2609d8.jpg", (664, 236, 727, 368), False, 2142, "ss_01 cola bottle 1x2"),
    ("Bread 2502 [2x1]", S + "ss_08_1502124d.jpg", (492, 645, 603, 698), False, 2502, "ss_08 bread 2x1 (freezer, frost cap)"),
    ("Bread 2502 [2x1]", T + "shot_14_t023.567s.jpg", (576, 329, 633, 386), True, 2502, "shot_14 bread roll 1x1"),
    ("Luncheon tin 2115 [2x1]", T + "shot_28_t043.250s.jpg", (535, 293, 583, 339), True, 2115, "shot_28 tin can (cooking-station cell)"),
    ("Luncheon tin 2115 [2x1]", T + "shot_14_t023.567s.jpg", (512, 202, 568, 321), True, 2115, 'shot_14 boxed food 1x2 "3/3"'),
    ("Dish 13540 (serves 13540-13542) [2x2]", T + "shot_43_t071.467s.jpg", (954, 330, 1075, 451), True, 13540, "shot_43 BBQ Ribs (Perfect) 2x2"),
    ("Dish failed 13543 [2x2]", T + "shot_43_t071.467s.jpg", (1082, 330, 1203, 451), True, 13543, "shot_43 steak dish 2x2"),
    ("Dish 13540 [1x1 recipe]", S + "ss_08_1502124d.jpg", (1318, 300, 1370, 352), False, 13540, "ss_08 recipe book bowl"),
    ("Bandage 2400 [2x1]", T + "shot_45_t075.533s.jpg", (384, 424, 569, 611), True, 2400, "shot_45 Military Medical Kit 3x3"),
    ("Planks 20106 [2x1]", S + "ss_07_02c2b148.jpg", (425, 351, 557, 484), False, 20106, "ss_07 wooden board 2x2"),
    ("Planks 20106 [2x1]", S + "ss_07_02c2b148.jpg", (355, 562, 419, 626), False, 20106, "ss_07 wood scraps 1x1"),
    ("Tomato seeds 15026 [1x1]", T + "shot_28_t043.250s.jpg", (588, 293, 634, 339), True, 15026, "shot_28 seed packet 1x1"),
    ("Mousetrap 25001 [1x1]", S + "ss_07_02c2b148.jpg", (425, 632, 489, 695), False, 25001, "ss_07 mousetrap 1x1 (same item)"),
    ("Mousetrap 25001 [1x1]", S + "ss_07_02c2b148.jpg", (284, 701, 348, 765), False, 25001, "ss_07 mousetrap 1x1 (same item)"),
    ("First-aid manual 3022 [1x2]", T + "shot_21_t031.050s.jpg", (654, 368, 699, 466), True, 3022, "shot_21 red hardcover book 1x2"),
    ("First-aid manual 3022 [1x2]", T + "shot_21_t031.050s.jpg", (759, 368, 804, 466), True, 3022, "shot_21 workbench manual 1x2"),
]

MEASURED = {
    "ss01 noodle cup 2x2": (S + "ss_01_8f2609d8.jpg", (804, 376, 937, 509)),
    "ss01 rice sack 3x4": (S + "ss_01_8f2609d8.jpg", (384, 446, 586, 720), 4, True),
    "ss01 cola 1x2": (S + "ss_01_8f2609d8.jpg", (664, 236, 727, 368)),
    "ss01 chips bag 2x2": (S + "ss_01_8f2609d8.jpg", (664, 376, 798, 509)),
    "ss01 supply box 4x3": (S + "ss_01_8f2609d8.jpg", (384, 236, 657, 438)),
    "ss01 cheese 1x1": (S + "ss_01_8f2609d8.jpg", (875, 236, 937, 298)),
    "ss01 dumplings 2x2": (S + "ss_01_8f2609d8.jpg", (734, 236, 867, 368)),
    "ss07 wooden board 2x2": (S + "ss_07_02c2b148.jpg", (425, 351, 557, 484)),
    "ss07 mousetrap 1x1 a": (S + "ss_07_02c2b148.jpg", (425, 632, 489, 695)),
    "ss07 mousetrap 1x1 b": (S + "ss_07_02c2b148.jpg", (284, 701, 348, 765)),
    "ss07 metal plate 2x2": (S + "ss_07_02c2b148.jpg", (564, 351, 698, 484)),
    "ss07 circuit board 2x2": (S + "ss_07_02c2b148.jpg", (284, 351, 418, 484)),
    "ss07 bracket 2x2": (S + "ss_07_02c2b148.jpg", (495, 702, 627, 835)),
}
SLOT = (41, 45, 48)


def src_image(rel, box, trailer=False):
    im = Image.open(os.path.join(SRC, rel)).convert("RGB").crop(box)
    if trailer:
        im = im.resize((round(im.width * TRAILER), round(im.height * TRAILER)), Image.LANCZOS)
    return im


def slot_colour(im):
    a = np.asarray(im).reshape(-1, 3).astype(float)
    lum = a @ [0.2126, 0.7152, 0.0722]
    sel = a[(lum > np.percentile(lum, 5)) & (lum < np.percentile(lum, 45))]
    return tuple(int(v) for v in np.median(sel, 0))


def our_file(item, side):
    for s, name in ((64, f"{item}@64.png"), (128, f"{item}@128.png"), (256, f"{item}.png")):
        if abs(side - s) <= 6:
            return Image.open(os.path.join(OURS, name)).convert("RGBA"), f"{s} px file 1:1"
    return Image.open(os.path.join(OURS, f"{item}.png")).convert("RGBA").resize((side, side), Image.LANCZOS), f"256 -> {side} Lanczos"


def our_slot(w, h, colour, item):
    slot = Image.new("RGBA", (w, h), colour + (255,))
    ImageDraw.Draw(slot).rounded_rectangle([0, 0, w - 1, h - 1], radius=max(3, round(min(w, h) * 0.06)), outline=(76, 77, 79, 255), width=1)
    side = min(w, h)
    ic, how = our_file(item, side)
    if ic.width > side:
        o = (ic.width - side) // 2
        ic = ic.crop((o, o, o + side, o + side))
    slot.alpha_composite(ic, ((w - ic.width) // 2, (h - ic.height) // 2))
    return slot.convert("RGB"), how


def side_by_side(pairs, k, path):
    cells = []
    for label, rel, box, trailer, item, note in pairs:
        s = src_image(rel, box, trailer)
        o, how = our_slot(s.width, s.height, slot_colour(s), item)
        cells.append((label, note, how, s.resize((s.width * k, s.height * k), Image.NEAREST), o.resize((o.width * k, o.height * k), Image.NEAREST)))
    pad, ncol, head = 12, (4 if k == 1 else 3), 64
    colw = max(300, max(c[3].width * 2 + 3 * pad for c in cells))
    rows = [cells[i:i + ncol] for i in range(0, len(cells), ncol)]
    rowh = [max(c[3].height for c in r) + 58 for r in rows]
    board = Image.new("RGB", (ncol * colw + pad, head + sum(rowh) + pad), (14, 15, 16))
    d = ImageDraw.Draw(board)
    d.text((pad, 10), f"WP-P0-12 after review 1: source icons (left) vs ours (right), same on-screen pixel size, x{k}", font=font(15, True), fill=(240, 240, 235))
    d.text((pad, 32), "Source: 1920x1080 screenshots at native game px; trailer crops rescaled by 1/0.90625. Ours: same slot size and the "
           "source slot colour; icon box fill 0.66 with the baked drop shadow; file used per pair in the caption.", font=font(11), fill=(170, 170, 165))
    y = head
    for r, hgt in zip(rows, rowh):
        for i, (label, note, how, s, o) in enumerate(r):
            x = pad + i * colw
            d.text((x, y), label, font=font(13), fill=(230, 200, 110))
            d.text((x, y + 16), f"L: {note}", font=font(11), fill=(160, 160, 155))
            d.text((x, y + 30), f"R: ours, {how}", font=font(11), fill=(160, 160, 155))
            board.paste(s, (x, y + 48))
            board.paste(o, (x + s.width + pad, y + 48))
        y += hgt
    board.save(path)
    return path


def lab(rgb):
    c = rgb / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = (lin @ m.T) / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return 116 * f[..., 1] - 16, np.hypot(500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2]))


def measure(a, pill=False):
    """Object segmented from its slot (the review's method): extent / slot side, L*, C*, the shadow below-right."""
    h = int(a.shape[0] * 0.84) if pill else a.shape[0]
    a = a[:h]
    bgrow = np.median(np.concatenate([a[:, :6], a[:, -6:]], axis=1), axis=1)
    obj = np.abs(a - bgrow[:, None, :]).max(-1) > 22
    from numpy.lib.stride_tricks import sliding_window_view
    obj &= sliding_window_view(np.pad(obj, 1), (3, 3)).sum((-1, -2)) >= 5
    ys, xs = np.nonzero(obj)
    ext = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
    lum = a @ [0.2126, 0.7152, 0.0722]
    blrow = bgrow @ [0.2126, 0.7152, 0.0722]
    near = np.zeros_like(obj)
    for dy in range(1, 11):
        for dx in range(0, 11):
            near[dy:, dx:] |= obj[:-dy, :-dx] if dx else obj[:-dy, :]
    zone = near & ~obj
    dark = zone & (lum < blrow[:, None] - 3)
    L, C = lab(a[obj])
    p = lambda v: [round(float(np.percentile(v, q)), 1) for q in (10, 50, 90)]
    return {"extent/slot": round(ext / min(a.shape[:2]), 2), "shadowShare": round(float(dark.sum() / max(1, zone.sum())), 2),
            "shadowDepth": round(float(np.median((blrow[:, None] - lum)[dark])) if dark.any() else 0.0, 1), "L*": p(L), "C*": p(C)}


def source_measure(rel, box, inset=4, pill=False):
    a = np.asarray(Image.open(os.path.join(SRC, rel)).convert("RGB")).astype(float)
    x0, y0, x1, y1 = box
    return measure(a[y0 + inset:y1 - inset, x0 + inset:x1 - inset], pill)


def our_measure(item, side=128):
    slot = Image.new("RGBA", (side, side), SLOT + (255,))
    ic, _ = our_file(item, side)
    slot.alpha_composite(ic, (0, 0))
    return measure(np.asarray(slot.convert("RGB")).astype(float)[4:-4, 4:-4])


def inventory(path):
    """Ours in the source inventory's metrics: 62 px cells with 8 px gaps (ss_01), each icon at its footprint."""
    cell, gap, cols, rows = 62, 8, 6, 5
    W, H = cols * cell + (cols + 1) * gap, rows * cell + (rows + 1) * gap
    src = src_image(S + "ss_01_8f2609d8.jpg", (378, 232, 944, 724))
    im = Image.new("RGB", (src.width + W + 40, max(src.height, H) + 60), (18, 19, 20))
    d = ImageDraw.Draw(im)
    d.text((12, 10), "Source ss_01 inventory, native px (left) / ours in the same cell metrics (right)", font=font(13, True), fill=(235, 235, 230))
    im.paste(src, (12, 40))
    ox, oy = src.width + 28, 40
    d.rectangle([ox, oy, ox + W, oy + H], fill=(38, 42, 45))
    place = [(2103, 0, 0, 3, 4), (2105, 3, 0, 2, 2), (13540, 3, 2, 2, 2), (2142, 5, 0, 1, 2), (2115, 5, 2, 1, 1), (15026, 5, 3, 1, 1),
             (2502, 3, 4, 2, 1), (2400, 0, 4, 2, 1), (25001, 5, 4, 1, 1), (3022, 2, 4, 1, 1)]
    for item, cx, cy, cw, ch in place:
        x = ox + gap + cx * (cell + gap)
        y = oy + gap + cy * (cell + gap)
        w, h = cw * cell + (cw - 1) * gap, ch * cell + (ch - 1) * gap
        slot, _ = our_slot(w, h, (38, 41, 43), item)
        im.paste(slot, (x, y))
    im.save(path)
    return path


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=os.path.join(ROOT, "docs", "art", "icons"))
    out = os.path.abspath(p.parse_args().out)
    os.makedirs(out, exist_ok=True)
    written = [side_by_side(PAIRS, 1, os.path.join(out, "review-side-by-side-1x.png"))]
    for i in range(0, len(PAIRS), 6):
        written.append(side_by_side(PAIRS[i:i + 6], 3, os.path.join(out, f"review-side-by-side-3x-p{i // 6 + 1}.png")))
    written.append(inventory(os.path.join(out, "review-inventory.png")))
    manifest = json.load(open(os.path.join(OURS, "manifest.json")))
    src = {k: source_measure(*v) for k, v in MEASURED.items()}
    ours = {str(e["params"]["item"]): our_measure(e["params"]["item"]) for e in manifest["assets"]}
    med = lambda d, f: round(float(np.median([f(v) for v in d.values()])), 2)
    summary = {k: {"source": med(src, f), "ours": med(ours, f)} for k, f in (
        ("extent/slot", lambda v: v["extent/slot"]), ("shadowShare", lambda v: v["shadowShare"]), ("shadowDepth", lambda v: v["shadowDepth"]),
        ("C* median", lambda v: v["C*"][1]), ("L* p90", lambda v: v["L*"][2]), ("L* p10", lambda v: v["L*"][0]))}
    stats = {"method": "object segmented from a slot of #292d30 (ours: the 128 px file composited 1:1), as in the WP-P0-12 review 1 stats",
             "summary (medians)": summary, "source": src, "ours@128": ours}
    with open(os.path.join(out, "review-stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
    for w in written:
        print("wrote", os.path.relpath(w, ROOT))
    print(json.dumps(summary))


main()
