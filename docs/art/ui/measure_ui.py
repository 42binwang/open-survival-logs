#!/usr/bin/env python3
"""UI measurements behind docs/UI.md (WP-P0-07), from the native screenshots and the trailer frames.

Run from the repo root:  python3 docs/art/ui/measure_ui.py
Needs Pillow and NumPy. Writes docs/art/ui/measurements.json; the spec (tests/e2e/ui-tile.spec.js) checks that every
sample box docs/UI.md quotes is measured here and that the measured colour is the one UI.md quotes.

The structure and the Buy-button, panel-alpha, frosted-frame and grid-pitch methods follow builder A's script
(WP-P0-07a). Every value is display-referred (sRGB codes as the source puts them on screen). Boxes are
[x0, y0, x1, y1], half-open, in the frame's own pixels: 1080p game pixels for the screenshots, file pixels for the
trailer frames (which hold the game at 0.90625 scale, docs/ART.md). Fill colours are the median of the selected
pixels; text colours the median of the brightest 20 % of the selected glyph pixels (anti-aliasing drags a plain
median towards the background). The screenshots are 4:2:0 JPEGs, so small coloured text under-reads its saturation.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'assets/targets/source'
FILES = {
    'ss_01': 'screenshots/ss_01_8f2609d8.jpg',
    'ss_02': 'screenshots/ss_02_dede236e.jpg',
    'ss_07': 'screenshots/ss_07_02c2b148.jpg',
    'ss_08': 'screenshots/ss_08_1502124d.jpg',
    't014': 'trailer/shot_07_t014.700s.jpg',
    't018': 'trailer/shot_08_t018.167s.jpg',
}
_cache = {}


def img(key):
    if key not in _cache:
        _cache[key] = np.asarray(Image.open(SOURCE / FILES[key]).convert('RGB')).astype(float)
    return _cache[key]


def hexc(c):
    return '#%02x%02x%02x' % tuple(int(round(min(255, max(0, v)))) for v in c)


SELECT = {
    'all': lambda p: np.ones(len(p), bool),
    'bright70': lambda p: p.mean(axis=1) > 70,
    'bright150': lambda p: p.mean(axis=1) > 150,
    'bright170': lambda p: p.mean(axis=1) > 170,
    'green': lambda p: (p[:, 1] > p[:, 0] + 15) & (p[:, 1] > p[:, 2] + 15),
    'greenFill': lambda p: (p[:, 1] > p[:, 0] + 15) & (p[:, 1] > p[:, 2] + 30) & (p.min(axis=1) < 150),
    'red': lambda p: p[:, 0] > p[:, 2] + 40,
    'yellow': lambda p: (p[:, 0] > 120) & (p[:, 1] > 90) & (p[:, 2] < p[:, 0] - 40),
    'blue': lambda p: p[:, 2] > p[:, 0] + 40,
    'notWhite': lambda p: p.min(axis=1) < 150,
}


def sample(key, box, select='all', text=False):
    x0, y0, x1, y1 = box
    px = img(key)[y0:y1, x0:x1].reshape(-1, 3)
    px = px[SELECT[select](px)]
    if len(px) == 0:
        raise ValueError(f'{key} {box}: no pixels for {select}')
    if text:
        order = np.argsort(px.mean(axis=1))
        px = px[order[int(len(px) * 0.8):]]
    return {'hex': hexc(np.median(px, axis=0)), 'n': int(len(px))}


# name: (frame, box, selection, text?, what, the value docs/UI.md quotes or None)
SAMPLES = {
    # docs/UI.md §2.2, measured colours
    'textStrong': ('ss_01', [382, 145, 499, 168], 'bright150', True, '"Inventory" window title', '#f4f6f3'),
    'goldPale': ('ss_07', [370, 252, 470, 278], 'bright150', True, 'active tab label "Inventory"', '#ffe8ad'),
    'goldDeep': ('ss_07', [300, 327, 820, 334], 'yellow', False, 'load bar, gold', '#d79e02'),
    'amber': ('ss_07', [968, 558, 1180, 576], 'yellow', True, 'crafted item "Spike Barrier Supply Box*1"', '#fbbb09'),
    'fresh': ('ss_01', [400, 716, 570, 719], 'green', False, 'freshness bar under the flour sack', '#71ae72'),
    'success': ('ss_07', [1085, 520, 1270, 545], 'green', True, '"Crafting Complete"', '#87e18e'),
    'online': ('ss_02', [1878, 596, 1888, 604], 'green', False, 'current-floor dot', '#5ed67f'),
    'xp': ('ss_07', [968, 582, 1066, 600], 'blue', True, '"Gained 70 XP."', '#68b4fa'),
    'alert': ('ss_02', [145, 136, 225, 147], 'red', False, 'Front Door hit-point bar', '#d73041'),
    'statWarn': ('ss_02', [1640, 972, 1660, 1002], 'all', False, 'Stamina fill', '#877524'),
    'coldCell': ('ss_08', [496, 422, 536, 464], 'all', False, 'empty freezer cell', '#12273a'),
    'tagMust': ('t018', [1215, 300, 1230, 320], 'all', False, '"Must Buy" tag (file px)', '#743a2a'),
    'track': ('ss_01', [900, 208, 935, 213], 'all', False, 'load bar track', '#121619'),
    'thumb': ('ss_01', [1534, 220, 1540, 400], 'all', False, 'shop scrollbar thumb', '#555654'),
    'tabOnBg': ('ss_07', [300, 250, 340, 280], 'all', False, 'active tab face', '#2b271c'),
    'goldChip': ('ss_02', [777, 992, 783, 1018], 'all', False, '"Pick One" chip', '#4f4112'),
    'cellEmpty': ('ss_01', [880, 690, 920, 730], 'all', False, 'empty backpack cell', '#17181c'),
    'slotEdge': ('ss_01', [384, 300, 386, 420], 'all', False, 'slot border', '#3e4244'),
    # docs/UI.md §2.2, other measured looks
    'buttonDisabled': ('ss_01', [420, 880, 560, 905], 'all', False, 'Checkout, disabled: face', '#2c2d31'),
    'textDisabled': ('ss_01', [607, 903, 714, 923], 'bright70', True, 'Checkout, disabled: label', '#7e7f81'),
    'shopRowHover': ('ss_01', [1240, 190, 1400, 210], 'all', False, 'shop row under the cursor', '#31332f'),
    'speedPressed': ('ss_02', [468, 1008, 480, 1048], 'all', False, 'pressed speed button face', '#433a18'),
    'tipFace': ('t014', [740, 640, 760, 700], 'all', False, 'rich tooltip face (file px)', '#191d20'),
    'dayCounter': ('ss_02', [1545, 50, 1710, 98], 'bright170', True, 'DAY7', '#e4e5e3'),
    # docs/UI.md §2.3, contrast-safe fills
    'chilledBadge': ('ss_08', [474, 298, 489, 312], 'notWhite', False, 'kept-cold status badge (price tag glyph excluded)', '#8e9e41'),
    # docs/UI.md §5.10 and §10, HUD
    'dialNight': ('ss_02', [1800, 70, 1830, 85], 'all', False, '24 h dial, inner disc, upper (night) half', '#222d2f'),
    'dialDay': ('ss_02', [1790, 120, 1805, 135], 'all', False, '24 h dial, inner disc, lower (day) half, clear of the hand', '#5e4139'),
    'encumbered': ('ss_02', [1500, 1030, 1510, 1050], 'all', False, 'Encumbered badge (ART.md --ui-danger is #6b0102)', '#861f28'),
    # surfaces (after A)
    'panelComposite': ('ss_01', [365, 125, 600, 135], 'all', False, 'inventory window, top padding, over the bright shop', None),
    'buyRest': ('ss_01', [1440, 345, 1545, 377], 'greenFill', False, 'Buy, row 2 (not hovered)', None),
    'buyHover': ('ss_01', [1440, 230, 1545, 262], 'greenFill', False, 'Buy, row 1, under the cursor', None),
}

# name: (frame, x, y0, y1, what): a vertical profile, top and bottom three rows
PROFILES = {
    'cellGradient': ('ss_01', 900, 656, 719, 'empty cell, top → bottom (--ui-cell-top → --ui-cell-bottom)'),
    'loopPill': ('ss_02', 1612, 113, 129, 'Loop: 1 pill, above the text'),
}


def profile(key, x, y0, y1):
    col = img(key)[y0:y1, x]
    return {'top': hexc(np.median(col[:3], axis=0)), 'bottom': hexc(np.median(col[-3:], axis=0)), 'median': hexc(np.median(col, axis=0))}


def grid_pitch():
    """Cell pitch of the ss_01 backpack from the bright gaps between empty cells along row y = 680 (after A)."""
    row = img('ss_01')[680, 560:960].mean(axis=1)
    peaks = [i for i in range(4, len(row) - 4) if row[i] > 40 and row[i] == row[i - 4:i + 5].max()]
    merged = []
    for p in peaks:
        if merged and p - merged[-1] < 6:
            continue
        merged.append(p)
    xs = [560 + p for p in merged]
    gaps = [int(g) for g in np.diff(xs) if g > 40]
    return {'row': 680, 'gapCentres': xs, 'gaps': gaps, 'pitch': float(np.median(gaps))}


def panel_alpha():
    """Opacity of the ss_01 Groceries window from a yellow floor line under its bottom edge (after A).

    With display-space blending, inside = a * P + (1 - a) * scene, so the line's contrast against the floor shrinks by
    (1 - a); the blue channel carries it (yellow has almost no blue).
    """
    im = img('ss_01')
    inside = im[842:866, 1470:1530].mean(axis=0)
    outside = im[878:900, 1470:1530].mean(axis=0)
    line_x, floor_x = slice(22, 32), slice(0, 14)
    d_in = inside[line_x].mean(axis=0) - inside[floor_x].mean(axis=0)
    d_out = outside[line_x].mean(axis=0) - outside[floor_x].mean(axis=0)
    transmit = float(d_in[2] / d_out[2])
    alpha = 1 - transmit
    floor_out = outside[floor_x].mean(axis=0)
    comp_in = inside[floor_x].mean(axis=0)
    return {
        'method': 'yellow floor line under the Groceries window bottom edge, blue-channel contrast inside / outside',
        'transmission': round(transmit, 3),
        'alpha': round(alpha, 3),
        'compositeOverFloor': hexc(comp_in),
        'floorOutside': hexc(floor_out),
        'panelColour': hexc((comp_in - transmit * floor_out) / alpha),
    }


def frosted_frame():
    """The ss_08 cooking window's outer frame: warm, smooth and lighter than the room above it (after A)."""
    im = img('ss_08')
    boxes = {'left': [211, 300, 225, 900], 'top': [300, 211, 1600, 222], 'gap': [752, 300, 764, 900], 'bottom': [300, 905, 1600, 918], 'sceneAbove': [300, 150, 1600, 200]}
    return {name: {'box': b, 'hex': hexc(np.median(im[b[1]:b[3], b[0]:b[2]].reshape(-1, 3), axis=0))} for name, b in boxes.items()}


def buy_buttons():
    """Every Buy button in the ss_01 Groceries list: box, size and fill (label excluded) (after A)."""
    im = img('ss_01')
    col = im[200:880, 1440:1545]
    mask = SELECT['green'](col.reshape(-1, 3)).reshape(col.shape[:2])
    rows = np.where(mask.sum(axis=1) > 20)[0]
    groups = []
    for y in rows:
        if groups and y - groups[-1][-1] <= 2:
            groups[-1].append(y)
        else:
            groups.append([y])
    out = []
    rest_px = []
    for g in groups:
        y0, y1 = g[0] + 200, g[-1] + 200
        reg = im[y0:y1 + 1, 1440:1545]
        m = SELECT['green'](reg.reshape(-1, 3)).reshape(reg.shape[:2])
        xs = np.where(m.any(axis=0))[0]
        px = reg[m]
        fill = px[px.min(axis=1) < 150]
        x0, x1 = int(xs[0] + 1440), int(xs[-1] + 1440)
        out.append({'box': [x0, int(y0), x1 + 1, int(y1) + 1], 'size': [x1 + 1 - x0, int(y1) + 1 - int(y0)], 'fill': hexc(np.median(fill, axis=0))})
        if len(out) > 1:
            rest_px.append(fill)
    # boxes include the anti-aliased edge row and column; the buttons are 64 x 32 (a few include a green neighbour)
    return {'hoveredRow': 1, 'buttons': out, 'rest': hexc(np.median(np.concatenate(rest_px), axis=0)), 'hover': out[0]['fill']}


def main():
    samples = {}
    for name, (key, box, sel, text, what, quoted) in SAMPLES.items():
        s = sample(key, box, sel, text)
        samples[name] = {'frame': key, 'box': box, 'select': sel, 'text': text, 'what': what, **s, 'uiMd': quoted}
    out = {
        'about': __doc__.strip().split('\n')[0],
        'script': 'docs/art/ui/measure_ui.py',
        'frames': FILES,
        'samples': samples,
        'profiles': {n: {'frame': k, 'x': x, 'y': [y0, y1], 'what': w, **profile(k, x, y0, y1)} for n, (k, x, y0, y1, w) in PROFILES.items()},
        'gridPitch': grid_pitch(),
        'panelAlpha': panel_alpha(),
        'frostedFrame': frosted_frame(),
        'buyButtons': buy_buttons(),
    }
    path = Path(__file__).with_name('measurements.json')
    path.write_text(json.dumps(out, indent=1) + '\n')
    off = [f"{n}: {s['hex']} (UI.md {s['uiMd']})" for n, s in samples.items() if s['uiMd'] and s['hex'] != s['uiMd']]
    print(f'wrote {path.relative_to(ROOT)}: {len(samples)} samples')
    print('differs from UI.md:', *off, sep='\n  ')


if __name__ == '__main__':
    main()
