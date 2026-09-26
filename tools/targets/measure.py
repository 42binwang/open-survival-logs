"""Value and saturation bands per material family, measured from the look references (WP-P0-04).

Reads tools/targets/regions.json (hand-picked rectangles in file pixels) and, for every sample, converts the pixels
from display sRGB to linear, then reports luminance (linear and sRGB-encoded), HSV value and saturation, CIE L*, C*
and hue. Families pool their samples (equal weight per sample) into 10th-90th percentile bands.

All values are display-referred: they are what the source game puts on screen after its own lighting, tone mapping
and grade, under the condition named per sample. They are look targets for the final frame, not albedo.

Outputs tools/targets/out/bands.json, tools/targets/out/bands.md and docs/art/bands/<family>.jpg boards.

    tools/targets/.venv/bin/python tools/targets/measure.py bands
"""

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'targets', 'source')
REGIONS = os.path.join(ROOT, 'tools', 'targets', 'regions.json')
OUT = os.path.join(ROOT, 'tools', 'targets', 'out')
BOARDS = os.path.join(ROOT, 'docs', 'art', 'bands')

FAMILY_ORDER = ['plaster', 'wood-floor', 'tiles', 'fabric', 'metal', 'glass', 'foliage', 'skin', 'blood', 'character', 'ui']
M_XYZ = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
WHITE = np.array([0.95047, 1.0, 1.08883])
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
FONT_B = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def lab(lin):
    xyz = lin @ M_XYZ.T / WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    L = 116 * f[:, 1] - 16
    a = 500 * (f[:, 0] - f[:, 1])
    b = 200 * (f[:, 1] - f[:, 2])
    return L, a, b


def metrics(srgb):
    """srgb: (n, 3) floats 0..1 -> dict of per-pixel metric arrays."""
    lin = srgb_to_linear(srgb)
    y = lin @ np.array([0.2126, 0.7152, 0.0722])
    mx, mn = srgb.max(1), srgb.min(1)
    L, a, b = lab(lin)
    return {
        'y_lin': y,
        'y_srgb': linear_to_srgb(y) * 255,
        'v': mx * 255,
        's': np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0.0),
        'L': L,
        'C': np.hypot(a, b),
        'a': a,
        'b': b,
    }


def select(srgb, mode):
    if not mode:
        return srgb
    m = metrics(srgb)
    if mode == 'bright':
        keep = m['v'] >= np.percentile(m['v'], 65)
    elif mode == 'dark':
        keep = m['v'] <= np.percentile(m['v'], 35)
    elif mode == 'saturated':
        keep = (m['s'] >= 0.35) & (m['v'] >= 60)
    elif mode == 'text':
        sat = m['s'] >= 0.3
        keep = sat & (m['v'] >= np.percentile(m['v'][sat], 75)) if sat.any() else sat
    elif mode == 'red':
        mx, mn = srgb.max(1), srgb.min(1)
        r, g, b = srgb[:, 0], srgb[:, 1], srgb[:, 2]
        hue = np.degrees(np.arctan2(math.sqrt(3) * (g - b), 2 * r - g - b)) % 360
        keep = (m['s'] >= 0.35) & ((hue <= 25) | (hue >= 340)) & (mx - mn > 0.04)
    else:
        raise ValueError(mode)
    return srgb[keep]


def summarise(srgb):
    m = metrics(srgb)
    out = {'n': int(len(srgb))}
    for k in ('y_lin', 'y_srgb', 'v', 's', 'L', 'C'):
        p10, p50, p90 = np.percentile(m[k], [10, 50, 90])
        nd = 4 if k in ('y_lin', 's') else 1
        out[k] = [round(float(p10), nd), round(float(p50), nd), round(float(p90), nd)]
    hue = math.degrees(math.atan2(float(np.mean(m['b'])), float(np.mean(m['a'])))) % 360
    out['hue_deg'] = round(hue, 1)
    lin_mean = srgb_to_linear(srgb).mean(0)
    out['mean_linear_rgb'] = [round(float(x), 4) for x in lin_mean]
    enc = np.clip(np.round(linear_to_srgb(lin_mean) * 255), 0, 255).astype(int)
    out['mean_hex'] = '#%02x%02x%02x' % tuple(enc)
    return out


def load(images, key, cache={}):
    if key not in cache:
        cache[key] = np.asarray(Image.open(os.path.join(SRC, images[key])).convert('RGB'))
    return cache[key]


def pixels(img, rect):
    x0, y0, x1, y1 = rect
    return img[y0:y1, x0:x1].reshape(-1, 3).astype(np.float64) / 255


def board(family, rows, images, out):
    tile_w, tile_h, text_h = 300, 220, 118
    cols = 4
    n = len(rows)
    nrows = (n + cols - 1) // cols
    im = Image.new('RGB', (cols * tile_w, 44 + nrows * (tile_h + text_h)), (18, 18, 20))
    dr = ImageDraw.Draw(im)
    f, fb = ImageFont.truetype(FONT, 14), ImageFont.truetype(FONT_B, 20)
    dr.text((10, 10), f'{family}: display-referred samples from the look references (red box = sample)', fill=(240, 240, 240), font=fb)
    for i, (s, st) in enumerate(rows):
        img = load(images, s['image'])
        x0, y0, x1, y1 = s['rect']
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        half = max(x1 - x0, y1 - y0, 60) * 1.4
        cw = max(half, (y1 - y0) * 0.7 * tile_w / tile_h)
        ch = cw * tile_h / tile_w
        box = [int(max(0, cx - cw)), int(max(0, cy - ch)), int(min(img.shape[1], cx + cw)), int(min(img.shape[0], cy + ch))]
        crop = Image.fromarray(img[box[1]:box[3], box[0]:box[2]])
        sc = min(tile_w / crop.width, tile_h / crop.height)
        crop = crop.resize((max(1, int(crop.width * sc)), max(1, int(crop.height * sc))), Image.LANCZOS)
        gx, gy = (i % cols) * tile_w, 44 + (i // cols) * (tile_h + text_h)
        im.paste(crop, (gx, gy))
        rx0, ry0 = gx + (x0 - box[0]) * sc, gy + (y0 - box[1]) * sc
        rx1, ry1 = gx + (x1 - box[0]) * sc, gy + (y1 - box[1]) * sc
        dr.rectangle([rx0, ry0, rx1, ry1], outline=(255, 40, 40), width=2)
        hexc = st['mean_hex']
        dr.rectangle([gx + 8, gy + tile_h + 8, gx + 40, gy + tile_h + 40], fill=hexc, outline=(200, 200, 200))
        lines = [f"{s['id']} ({s['image']}, {s['condition']})",
                 s['what'][:44],
                 f"{hexc}  sRGB-lum {st['y_srgb'][1]:.0f} [{st['y_srgb'][0]:.0f}-{st['y_srgb'][2]:.0f}]",
                 f"lin {st['y_lin'][1]:.3f}  L* {st['L'][1]:.0f}  C* {st['C'][1]:.0f}  h {st['hue_deg']:.0f}",
                 f"V {st['v'][1]:.0f}  S {st['s'][1]:.2f} [{st['s'][0]:.2f}-{st['s'][2]:.2f}]"]
        for j, t in enumerate(lines):
            dr.text((gx + (48 if j < 2 else 8), gy + tile_h + 6 + 21 * j), t, fill=(225, 225, 225), font=f)
    im.save(out, quality=88)


def bands():
    cfg = json.load(open(REGIONS))
    images, conds = cfg['images'], cfg['conditions']
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BOARDS, exist_ok=True)
    rng = np.random.default_rng(1)
    per_sample, fam_rows, fam_pix = [], {}, {}
    for s in cfg['samples']:
        s = dict(s, condition=conds[s['image']])
        px = select(pixels(load(images, s['image']), s['rect']), s.get('select'))
        st = summarise(px)
        per_sample.append({**{k: s[k] for k in ('id', 'family', 'image', 'condition', 'what', 'rect')}, **st})
        fam_rows.setdefault(s['family'], []).append((s, st))
        fam_pix.setdefault(s['family'], []).append(px[rng.integers(0, len(px), 4000)])
    families = {}
    for fam in FAMILY_ORDER:
        if fam not in fam_rows:
            continue
        pooled = summarise(np.concatenate(fam_pix[fam]))
        pooled['samples'] = [s['id'] for s, _ in fam_rows[fam]]
        pooled['conditions'] = sorted({s['condition'] for s, _ in fam_rows[fam]})
        families[fam] = pooled
        board(fam, fam_rows[fam], images, os.path.join(BOARDS, f'{fam}.jpg'))
    json.dump({'about': 'display-referred bands: [p10, median, p90]', 'families': families, 'samples': per_sample},
              open(os.path.join(OUT, 'bands.json'), 'w'), indent=1)
    md = ['| family | n | sRGB luminance (0-255) | linear luminance | HSV V (0-255) | HSV S | L* | C* | hue | mean |',
          '|---|---|---|---|---|---|---|---|---|---|']
    for fam, p in families.items():
        md.append(f"| {fam} | {len(p['samples'])} | {p['y_srgb'][0]:.0f} / {p['y_srgb'][1]:.0f} / {p['y_srgb'][2]:.0f} | "
                  f"{p['y_lin'][0]:.3f} / {p['y_lin'][1]:.3f} / {p['y_lin'][2]:.3f} | "
                  f"{p['v'][0]:.0f} / {p['v'][1]:.0f} / {p['v'][2]:.0f} | {p['s'][0]:.2f} / {p['s'][1]:.2f} / {p['s'][2]:.2f} | "
                  f"{p['L'][0]:.0f} / {p['L'][1]:.0f} / {p['L'][2]:.0f} | {p['C'][0]:.0f} / {p['C'][1]:.0f} / {p['C'][2]:.0f} | "
                  f"{p['hue_deg']:.0f} | {p['mean_hex']} |")
    md.append('')
    md.append('| sample | condition | what | sRGB lum | lin lum | V | S | L* | C* | hue | mean |')
    md.append('|---|---|---|---|---|---|---|---|---|---|---|')
    for s in per_sample:
        md.append(f"| {s['id']} | {s['condition']} | {s['what']} | {s['y_srgb'][1]:.0f} | {s['y_lin'][1]:.3f} | {s['v'][1]:.0f} | "
                  f"{s['s'][1]:.2f} | {s['L'][1]:.0f} | {s['C'][1]:.0f} | {s['hue_deg']:.0f} | {s['mean_hex']} |")
    open(os.path.join(OUT, 'bands.md'), 'w').write('\n'.join(md) + '\n')
    for fam, p in families.items():
        print(f"{fam:10s} sRGB-lum {p['y_srgb']}  lin {p['y_lin']}  S {p['s']}  L* {p['L']}  C* {p['C']}  {p['mean_hex']}")


# ---------------------------------------------------------------------------------------------------------------
# Lighting conditions, lamps, vignette and grain

TRAILER_SCALE = 1740 / 1920
TRAILER_OFFSET = (90, 9)
TRAILER_GAME = (90, 9, 1830, 988)
HUD_GAME = [(1640, 0, 1920, 1080), (1430, 0, 1920, 215), (0, 820, 760, 1080), (600, 900, 1400, 1080)]
TOPLEFT_QUESTS = (0, 0, 620, 280)
# red status-effect edge glow ('Bleeding', 'High Alert'): a 160 px band on every side of the game frame
STATUS_EDGE = [(0, 0, 1920, 160), (0, 920, 1920, 1080), (0, 0, 160, 1080), (1760, 0, 1920, 1080)]

# (id, file, condition, time label, extra masks in game px)
FRAMES = [
    ('ss_06', 'screenshots/ss_06_bdcdf4bc.jpg', 'dawn', 'Day 2 07:50, overcast', [TOPLEFT_QUESTS]),
    ('t061', 'trailer/shot_36_t061.150s.jpg', 'dawn', 'Day 2 07:50 (inventory open)', [TOPLEFT_QUESTS, (200, 110, 1150, 480)]),
    ('ss_07', 'screenshots/ss_07_02c2b148.jpg', 'day', 'Day 5 09:50, cloudy (UI open)', [TOPLEFT_QUESTS, (250, 210, 1650, 870)]),
    ('t069', 'trailer/shot_41_t068.883s.jpg', 'day', 'Day 1 11:50, interior', [(0, 0, 480, 120)]),
    ('t074', 'trailer/shot_44_t073.800s.jpg', 'day', 'Day 1 12:10, interior', [(0, 0, 480, 120)]),
    ('ss_02', 'screenshots/ss_02_dede236e.jpg', 'day', 'Day 7 11:50, terrace', [(0, 0, 430, 250)]),
    ('t059', 'trailer/shot_35_t059.417s.jpg', 'day', 'Day 1 14:40, roof in sun', [(0, 0, 560, 250)]),
    ('t032', 'trailer/shot_22_t032.300s.jpg', 'day', 'Day 3, roof', [TOPLEFT_QUESTS]),
    ('ss_08', 'screenshots/ss_08_1502124d.jpg', 'dusk', 'Day 4 16:20 (cooking UI open)', [TOPLEFT_QUESTS, (240, 200, 1720, 900)]),
    ('ss_04', 'screenshots/ss_04_344f0472.jpg', 'dusk', 'Day 1 17:20, storeroom', []),
    ('t035', 'trailer/shot_24_t035.212s.jpg', 'dusk', 'golden hour, apartment 1F', [(700, 0, 1250, 140)]),
    ('t049', 'trailer/shot_31_t049.038s.jpg', 'dusk', 'low sun, front yard (punch-in)', []),
    ('t033', 'trailer/shot_23_t033.500s.jpg', 'night-lamps', 'Day 18 night, lamps on', [(1200, 250, 1920, 760)]),
    ('t025', 'trailer/shot_15_t024.933s.jpg', 'night-lamps', 'storeroom, lamps on (punch-in)', []),
    ('t077', 'trailer/shot_46_t076.950s.jpg', 'night-lamps', 'exterior wall lamp (punch-in)', []),
    ('t036', 'trailer/shot_25_t036.696s.jpg', 'night-exterior', 'street at night, moonlight + fire (punch-in)', []),
    ('t013', 'trailer/shot_13_t022.650s.jpg', 'blackout', 'supermarket, flashlight only', STATUS_EDGE + [(640, 80, 1280, 140)]),
    ('ss_05', 'screenshots/ss_05_d6bcfba5.jpg', 'storm', 'Day 16 03:40, night rain', [(0, 0, 560, 180)]),
    ('t038', 'trailer/shot_26_t038.333s.jpg', 'storm', 'Day 17 05:50, rain, horde', []),
    ('t041', 'trailer/shot_27_t041.417s.jpg', 'cold-wave', 'Day 16 15:20, snow', [(0, 0, 560, 200)]),
]

# Lamp pools, measured on the lit surface with the emitter and its bloom masked out: for each light, patches of one
# surface at known screen offsets from the emitter, plus an ambient patch of the same surface out of the pool.
# (id, frame, emitter centre file px, emitter + bloom mask radius px, bulb height above floor m (decided),
#  [(label, rect)], ambient rect, what)
LAMP_PATCHES = [
    ('lamp-t069', 't069', (1318, 240), 34, 0.95,
     [('wall, beside the shade', (1256, 212, 1276, 240)), ('wall, upper left', (1215, 110, 1255, 190))],
     (1570, 160, 1625, 240), 'table lamp on the bedroom back wall, Day 1 11:50 (native)'),
    ('lamp-t033', 't033', (815, 323), 34, 0.95,
     [('wall, above the shade', (790, 258, 815, 276)), ('wall, beside the racket', (760, 195, 790, 225))],
     (670, 160, 700, 190), 'same table lamp at night, Day 18 (native); the far patch is still inside the pool'),
]

def frame_mask(fid, rel, extra, shape):
    h, w = shape[:2]
    m = np.zeros((h, w), bool)
    trailer = rel.startswith('trailer/')
    if trailer:
        x0, y0, x1, y1 = TRAILER_GAME
        m[y0:y1, x0:x1] = True
        m[870:, :] = False
    else:
        m[:, :] = True
    boxes = list(extra)
    hud = trailer is False or fid in ('t069', 't074', 't059', 't032', 't035', 't033', 't041', 't061', 't013', 't038')
    if hud:
        boxes += HUD_GAME
    for b in boxes:
        if trailer:
            b = [b[0] * TRAILER_SCALE + TRAILER_OFFSET[0], b[1] * TRAILER_SCALE + TRAILER_OFFSET[1],
                 b[2] * TRAILER_SCALE + TRAILER_OFFSET[0], b[3] * TRAILER_SCALE + TRAILER_OFFSET[1]]
        x0, y0, x1, y1 = [int(round(v)) for v in b]
        m[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = False
    return m


def xy_to_cct(x, y):
    n = (x - 0.3320) / (0.1858 - y)
    return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33


def lin_to_xy(rgb):
    X, Y, Z = M_XYZ @ np.asarray(rgb, float)
    s = X + Y + Z
    return X / s, Y / s


def frame_stats(img, mask):
    px = img[mask].reshape(-1, 3).astype(np.float64) / 255
    m = metrics(px)
    y = m['y_srgb']
    out = {'pixels': int(len(px))}
    out['lum_srgb_p'] = {str(p): round(float(np.percentile(y, p)), 1) for p in (1, 5, 25, 50, 75, 95, 99)}
    out['lum_lin_mean'] = round(float(m['y_lin'].mean()), 4)
    out['sat_p50_p90'] = [round(float(np.percentile(m['s'], 50)), 3), round(float(np.percentile(m['s'], 90)), 3)]
    neutral = m['C'] < 12
    tints = {}
    for lo, hi in ((0, 20), (20, 40), (40, 60), (60, 101)):
        sel = neutral & (m['L'] >= lo) & (m['L'] < hi)
        if sel.sum() > 500:
            tints[f'L{lo}-{hi}'] = {'a': round(float(m['a'][sel].mean()), 2), 'b': round(float(m['b'][sel].mean()), 2),
                                   'share': round(float(sel.mean()), 3)}
    out['neutral_tint_ab'] = tints
    lin = srgb_to_linear(px)
    whole = lin.mean(0)
    out['mean_rgb_lin'] = [round(float(v), 4) for v in whole]
    x, yy = lin_to_xy(whole)
    out['mean_xy'] = [round(float(x), 4), round(float(yy), 4)]
    out['mean_cct_k'] = int(round(xy_to_cct(x, yy), -1))
    top = m['y_lin'] >= np.percentile(m['y_lin'], 97)
    top &= m['v'] < 250
    if top.sum() > 50:
        tl = lin[top].mean(0)
        tx, ty = lin_to_xy(tl)
        out['highlight_cct_k'] = int(round(xy_to_cct(tx, ty), -1))
        out['highlight_hex'] = '#%02x%02x%02x' % tuple(np.clip(np.round(linear_to_srgb(tl / tl.max() * 0.9) * 255), 0, 255).astype(int))
    return out, y


def lighting():
    os.makedirs(OUT, exist_ok=True)
    board_dir = os.path.join(ROOT, 'docs', 'art', 'lighting')
    os.makedirs(board_dir, exist_ok=True)
    res = {'about': 'display-referred frame statistics, HUD/captions masked; lum = sRGB-encoded luminance 0-255',
           'frames': [], 'conditions': {}}
    hists = {}
    for fid, rel, cond, label, extra in FRAMES:
        img = np.asarray(Image.open(os.path.join(SRC, rel)).convert('RGB'))
        mask = frame_mask(fid, rel, extra, img.shape)
        st, y = frame_stats(img, mask)
        res['frames'].append({'id': fid, 'file': rel, 'condition': cond, 'label': label, **st})
        hists[fid] = np.histogram(y, bins=64, range=(0, 256))[0]
    for cond in dict.fromkeys(f[2] for f in FRAMES):
        rows = [r for r in res['frames'] if r['condition'] == cond]
        agg = {'frames': [r['id'] for r in rows]}
        for p in ('1', '5', '50', '95', '99'):
            agg[f'lum_p{p}'] = round(float(np.mean([r['lum_srgb_p'][p] for r in rows])), 1)
        agg['sat_p50'] = round(float(np.mean([r['sat_p50_p90'][0] for r in rows])), 3)
        agg['mean_cct_k'] = int(round(float(np.mean([r['mean_cct_k'] for r in rows])), -1))
        res['conditions'][cond] = agg
    json.dump(res, open(os.path.join(OUT, 'lighting.json'), 'w'), indent=1)
    lighting_board(res, hists, os.path.join(board_dir, 'conditions.jpg'))
    for r in res['frames']:
        p = r['lum_srgb_p']
        print(f"{r['id']:6s} {r['condition']:14s} lum p1 {p['1']:5.1f} p5 {p['5']:5.1f} p50 {p['50']:5.1f} p95 {p['95']:5.1f} "
              f"p99 {p['99']:5.1f}  S50 {r['sat_p50_p90'][0]:.2f}  CCT(mean) {r['mean_cct_k']}  "
              f"CCT(hi) {r.get('highlight_cct_k')}  tint {r['neutral_tint_ab']}")


def lighting_board(res, hists, out):
    tw, th = 320, 180
    conds = list(res['conditions'])
    maxn = max(len(res['conditions'][c]['frames']) for c in conds)
    W_ = 190 + maxn * (tw + 10)
    H_ = 40 + len(conds) * (th + 70)
    im = Image.new('RGB', (W_, H_), (16, 16, 18))
    dr = ImageDraw.Draw(im)
    f, fb = ImageFont.truetype(FONT, 13), ImageFont.truetype(FONT_B, 18)
    dr.text((10, 10), 'Lighting conditions in the references: frame, luminance histogram (sRGB-encoded), p5 / p50 / p95, mean CCT',
            fill=(240, 240, 240), font=fb)
    byid = {r['id']: r for r in res['frames']}
    for ci, cond in enumerate(conds):
        y0 = 40 + ci * (th + 70)
        agg = res['conditions'][cond]
        dr.text((10, y0 + 4), cond, fill=(255, 210, 120), font=fb)
        dr.text((10, y0 + 30), f"p5 {agg['lum_p5']:.0f}", fill=(220, 220, 220), font=f)
        dr.text((10, y0 + 48), f"p50 {agg['lum_p50']:.0f}", fill=(220, 220, 220), font=f)
        dr.text((10, y0 + 66), f"p95 {agg['lum_p95']:.0f}", fill=(220, 220, 220), font=f)
        dr.text((10, y0 + 84), f"S50 {agg['sat_p50']:.2f}", fill=(220, 220, 220), font=f)
        dr.text((10, y0 + 102), f"{agg['mean_cct_k']} K", fill=(220, 220, 220), font=f)
        for k, fid in enumerate(agg['frames']):
            r = byid[fid]
            x0 = 190 + k * (tw + 10)
            thumb = Image.open(os.path.join(SRC, r['file'])).convert('RGB').resize((tw, th), Image.LANCZOS)
            im.paste(thumb, (x0, y0))
            h = hists[fid].astype(float)
            h = h / h.max()
            for b, v in enumerate(h):
                bx = x0 + b * tw / 64
                dr.rectangle([bx, y0 + th + 40 - v * 34, bx + tw / 64 - 1, y0 + th + 40], fill=(int(b * 4), int(b * 4), int(b * 4)))
            p = r['lum_srgb_p']
            dr.text((x0, y0 + th + 44), f"{fid}: {r['label'][:40]}", fill=(230, 230, 230), font=f)
            dr.text((x0 + 2, y0 + th + 2), f"p5 {p['5']:.0f} p50 {p['50']:.0f} p95 {p['95']:.0f}  {r['mean_cct_k']} K",
                    fill=(255, 255, 255), font=f)
    im.save(out, quality=86)


def camera_for(fid):
    cams = json.load(open(os.path.join(OUT, 'camera.json')))
    cams = {c['id']: c for c in cams['views']}
    return cams.get(fid)


def lamps():
    """Lamp pools on the lit surface (see LAMP_PATCHES). Each patch sits outside the emitter + bloom mask; the
    display values are inverted through three.js AgX (lut.agx_inverse_grey) to scene-referred ratios against the
    ambient patch. Distances: screen offset from the emitter converted to metres at the emitter's depth, with the
    wall's foreshortening undone (vertical / cos 40 deg, horizontal / cos 30 deg)."""
    sys.path.insert(0, os.path.dirname(__file__))
    import lut as L
    frames = {f[0]: f for f in FRAMES}
    scale = json.load(open(os.path.join(OUT, 'scale.json')))
    cam_h = scale['camera_height_m']
    out = []
    boards = []
    for lid, fid, (cx, cy), r_mask, bulb_h, patches, amb_rect, what in LAMP_PATCHES:
        rel = frames[fid][1]
        img = np.asarray(Image.open(os.path.join(SRC, rel)).convert('RGB')).astype(np.float64) / 255
        trailer = rel.startswith('trailer/')
        cam = camera_for(fid)
        f_file = cam['f_px'] * (TRAILER_SCALE if trailer else 1.0)
        pitch = math.radians(cam['pitch_deg'])
        gy = ((cy - TRAILER_OFFSET[1]) / TRAILER_SCALE) if trailer else cy
        ang = pitch + math.atan((gy - 540) / cam['f_px'])
        depth = (cam_h - bulb_h) / math.sin(ang) * math.cos(ang - pitch)
        m_per_px = depth / f_file

        def lum8(rect):
            x0, y0, x1, y1 = rect
            px = img[y0:y1, x0:x1].reshape(-1, 3)
            return float(linear_to_srgb(np.median(srgb_to_linear(px) @ np.array([0.2126, 0.7152, 0.0722]))) * 255)

        amb = lum8(amb_rect)
        s_amb = L.agx_inverse_grey(amb / 255)
        yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]]
        core = (np.hypot(xx - cx, yy - cy) < 14) & (img.max(2) < 0.98)
        e_rgb = srgb_to_linear(img[core]).mean(0)
        e_hex = '#%02x%02x%02x' % tuple(np.clip(np.round(linear_to_srgb(e_rgb) * 255), 0, 255).astype(int))
        rows = []
        for label, rect in patches:
            x0, y0, x1, y1 = rect
            pcx, pcy = (x0 + x1) / 2, (y0 + y1) / 2
            gap = math.hypot(pcx - cx, pcy - cy) - max(x1 - x0, y1 - y0) / 2
            assert gap >= r_mask - 1, f'{lid} {label}: patch inside the emitter/bloom mask'
            d = math.hypot((pcx - cx) / math.cos(math.radians(30)), (pcy - cy) / math.cos(math.radians(40))) * m_per_px
            val = lum8(rect)
            c = L.agx_inverse_grey(val / 255) / s_amb
            rows.append({'label': label, 'rect': list(rect), 'display_srgb_lum': round(val, 1),
                         'distance_from_bulb_m': round(d, 2), 'scene_contrast_vs_ambient': round(c, 2)})
        out.append({'id': lid, 'frame': fid, 'what': what, 'emitter_px': [cx, cy], 'mask_radius_px': r_mask,
                    'bulb_height_m_decided': bulb_h, 'm_per_px_at_emitter': round(m_per_px, 4),
                    'ambient_rect': list(amb_rect), 'ambient_display_srgb_lum': round(amb, 1), 'patches': rows,
                    'emitter_hex': e_hex, 'emitter_px_within_14': int(core.sum())})
        boards.append((fid, rel, (cx, cy), r_mask, patches, amb_rect, rows, lid))
        print(lid, 'ambient', round(amb, 1), [(r['label'], r['display_srgb_lum'], r['distance_from_bulb_m'], r['scene_contrast_vs_ambient']) for r in rows])
    json.dump({'about': lamps.__doc__.strip(), 'lamps': out}, open(os.path.join(OUT, 'lamps.json'), 'w'), indent=1)
    lamp_board(boards)


def lamp_board(boards):
    tw, th = 520, 360
    im = Image.new('RGB', (len(boards) * (tw + 10) + 10, th + 150), (16, 16, 18))
    dr = ImageDraw.Draw(im)
    f, fb = ImageFont.truetype(FONT, 14), ImageFont.truetype(FONT_B, 17)
    dr.text((10, 8), 'Lamp pools on the lit surface: red = emitter + bloom mask, yellow = lit patches, cyan = ambient patch',
            fill=(240, 240, 240), font=fb)
    for i, (fid, rel, (cx, cy), r_mask, patches, amb_rect, rows, lid) in enumerate(boards):
        src = Image.open(os.path.join(SRC, rel)).convert('RGB')
        xs = [cx - r_mask, amb_rect[0], amb_rect[2]] + [p[1][0] for p in patches] + [p[1][2] for p in patches]
        ys = [cy - r_mask, cy + r_mask, amb_rect[1], amb_rect[3]] + [p[1][1] for p in patches] + [p[1][3] for p in patches]
        box = [min(xs) - 30, min(ys) - 30, max(xs) + 30, max(ys) + 30]
        crop = src.crop(box)
        sc = min(tw / crop.width, th / crop.height)
        crop = crop.resize((int(crop.width * sc), int(crop.height * sc)), Image.LANCZOS)
        d2 = ImageDraw.Draw(crop)
        T = lambda x, y: ((x - box[0]) * sc, (y - box[1]) * sc)
        d2.ellipse([*T(cx - r_mask, cy - r_mask), *T(cx + r_mask, cy + r_mask)], outline=(255, 60, 60), width=2)
        for _, r in patches:
            d2.rectangle([*T(r[0], r[1]), *T(r[2], r[3])], outline=(255, 220, 0), width=2)
        d2.rectangle([*T(amb_rect[0], amb_rect[1]), *T(amb_rect[2], amb_rect[3])], outline=(0, 230, 255), width=2)
        x = 10 + i * (tw + 10)
        im.paste(crop, (x, 34))
        lines = [f'{lid} ({fid})'] + [f"{r['label']}: {r['distance_from_bulb_m']} m, contrast {r['scene_contrast_vs_ambient']}:1" for r in rows]
        for j, t in enumerate(lines):
            dr.text((x, 34 + th + 8 + 20 * j), t, fill=(225, 225, 225), font=f)
    os.makedirs(os.path.join(ROOT, 'docs', 'art', 'lighting'), exist_ok=True)
    im.save(os.path.join(ROOT, 'docs', 'art', 'lighting', 'lamps.jpg'), quality=88)


def vignette():
    """Median radial falloff over the game area of every reference frame, HUD masked, normalised to the centre.
    Content (bright rooms in the middle, dark yards at the edges) biases this towards a stronger falloff, so
    vignette_pan() below measures it free of content from camera pans."""
    import glob
    files = sorted(glob.glob(os.path.join(SRC, 'screenshots', '*.jpg'))) + sorted(glob.glob(os.path.join(SRC, 'trailer', '*.jpg')))
    nb = 12
    profs = {'screenshots': [], 'trailer': []}
    for fpath in files:
        rel = os.path.relpath(fpath, SRC)
        trailer = rel.startswith('trailer/')
        img = np.asarray(Image.open(fpath).convert('L').resize((480, 270), Image.BOX)).astype(np.float64) / 255
        y = srgb_to_linear(img)
        if trailer:
            x0, y0, x1, y1 = [v / 4 for v in TRAILER_GAME]
            y1 = min(y1, 870 / 4)
        else:
            x0, y0, x1, y1 = 0, 0, 480, 270
        hh, ww = y.shape
        yy, xx = np.mgrid[0:hh, 0:ww]
        cx, cy = (x0 + x1) / 2, (TRAILER_GAME[1] + TRAILER_GAME[3]) / 8 if trailer else 135
        half_diag = math.hypot((x1 - x0) / 2, (TRAILER_GAME[3] - TRAILER_GAME[1]) / 8 if trailer else 135)
        r = np.hypot(xx - cx, yy - cy) / half_diag
        m = (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
        for b in HUD_GAME:
            bb = [(b[0] * TRAILER_SCALE + 90) / 4, (b[1] * TRAILER_SCALE + 9) / 4, (b[2] * TRAILER_SCALE + 90) / 4,
                  (b[3] * TRAILER_SCALE + 9) / 4] if trailer else [v / 4 for v in b]
            m &= ~((xx >= bb[0]) & (xx < bb[2]) & (yy >= bb[1]) & (yy < bb[3]))
        prof = []
        for i in range(nb):
            sel = m & (r >= i / nb) & (r < (i + 1) / nb)
            prof.append(float(np.mean(y[sel])) if sel.sum() > 30 else np.nan)
        prof = np.array(prof)
        if not np.isfinite(prof[0]) or prof[0] < 0.01:
            continue
        profs['trailer' if trailer else 'screenshots'].append(prof / np.nanmean(prof[:2]))
    res = {'about': 'median linear-luminance ratio vs the frame centre by normalised radius (1 = frame corner)', 'bins': nb}
    for k, v in profs.items():
        a = np.array(v)
        res[k] = {'frames': len(v), 'median': [round(float(x), 3) for x in np.nanmedian(a, 0)],
                  'p25': [round(float(x), 3) for x in np.nanpercentile(a, 25, 0)],
                  'p75': [round(float(x), 3) for x in np.nanpercentile(a, 75, 0)]}
        print(k, len(v), res[k]['median'])
    json.dump(res, open(os.path.join(OUT, 'vignette.json'), 'w'), indent=1)


def vignette_pan():
    """Vignette from camera pans: for consecutive trailer frames (4 fps) inside one shot, find the global shift by
    phase correlation; a surface seen at screen points x (frame 2) and x + d (frame 1) gives
    log I2(x) - log I1(x + d) = log V(x) - log V(x + d). Fit log V(r) = a1 r^2 + a2 r^4 (r = 1 at the frame corner)
    with a free offset per pair. Needs the remuxed trailer from fetch-targets.mjs in tools/targets/.cache."""
    import subprocess
    import cv2
    mp4 = os.path.join(ROOT, 'tools', 'targets', '.cache', 'trailer_257229528_1080p.mp4')
    if not os.path.exists(mp4):
        print('vignette_pan: run node tools/targets/fetch-targets.mjs first (needs the cached trailer)')
        return
    manifest = json.load(open(os.path.join(SRC, 'manifest.json')))
    shots = manifest['trailer']['shots']
    w, h = 480, 270
    raw = subprocess.run([os.environ.get('FFMPEG', 'ffmpeg'), '-hide_banner', '-loglevel', 'error', '-i', mp4, '-vf',
                          f'fps=8,scale={w}:{h}:flags=area,format=gray', '-f', 'rawvideo', '-'],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float64) / 255
    gx0, gy0, gx1, gy1 = [v / 4 for v in TRAILER_GAME]
    gy1 = 860 / 4
    cx, cy = (TRAILER_GAME[0] + TRAILER_GAME[2]) / 8, (TRAILER_GAME[1] + TRAILER_GAME[3]) / 8
    half = math.hypot((TRAILER_GAME[2] - TRAILER_GAME[0]) / 8, (TRAILER_GAME[3] - TRAILER_GAME[1]) / 8)
    yy, xx = np.mgrid[0:h, 0:w]
    valid = (xx >= gx0 + 2) & (xx < gx1 - 2) & (yy >= gy0 + 2) & (yy < gy1)
    for b in HUD_GAME + [TOPLEFT_QUESTS]:
        bb = [(b[0] * TRAILER_SCALE + 90) / 4, (b[1] * TRAILER_SCALE + 9) / 4, (b[2] * TRAILER_SCALE + 90) / 4, (b[3] * TRAILER_SCALE + 9) / 4]
        valid &= ~((xx >= bb[0]) & (xx < bb[2]) & (yy >= bb[1]) & (yy < bb[3]))
    crop_h, crop_w = int(gy1) - int(gy0), int(gx1) - int(gx0)
    win = cv2.createHanningWindow((crop_w, crop_h), cv2.CV_64F)
    # HUD test: the right-hand HUD column (game x 1650-1910, y 250-700) stays still while the picture pans
    hx0, hx1 = int((1650 * TRAILER_SCALE + 90) / 4), int((1910 * TRAILER_SCALE + 90) / 4)
    hy0, hy1 = int((250 * TRAILER_SCALE + 9) / 4), int((700 * TRAILER_SCALE + 9) / 4)
    rows_A, rows_b, used, rejected = [], [], [], []
    rng = np.random.default_rng(3)
    for s in shots:
        i0, i1 = int(math.ceil(s['start'] * 8)) + 1, int(s['end'] * 8) - 1
        for i in range(i0, i1):
            a, b = frames[i], frames[i + 1]
            ca = a[int(gy0):int(gy1), int(gx0):int(gx1)]
            cb = b[int(gy0):int(gy1), int(gx0):int(gx1)]
            (dx, dy), resp = cv2.phaseCorrelate(ca, cb, win)
            if resp < 0.12 or math.hypot(dx, dy) < 3 or math.hypot(dx, dy) > 90:
                continue
            still = float(np.abs(a[hy0:hy1, hx0:hx1] - b[hy0:hy1, hx0:hx1]).mean())
            moving = float(np.abs(ca - cb).mean())
            if not (still < 0.004 and still < 0.25 * moving):
                rejected.append({'t': round(i / 8, 3), 'shot': s['index'], 'hud_strip_diff': round(still, 4), 'scene_diff': round(moving, 4)})
                continue
            M = np.float64([[1, 0, dx], [0, 1, dy]])
            a_shift = cv2.warpAffine(a, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=-1)
            vs = cv2.warpAffine(valid.astype(np.float64), M, (w, h), flags=cv2.INTER_NEAREST, borderValue=0) > 0.5
            ok = valid & vs & (a_shift > 0.06) & (b > 0.06) & (a_shift < 0.95) & (b < 0.95)
            ga, gb = cv2.GaussianBlur(a_shift, (0, 0), 1.5), cv2.GaussianBlur(b, (0, 0), 1.5)
            ok &= np.hypot(*np.gradient(gb)) < 0.01
            idx = np.flatnonzero(ok)
            if len(idx) < 800:
                continue
            idx = rng.choice(idx, min(len(idx), 3000), replace=False)
            py, px_ = np.unravel_index(idx, (h, w))
            r2 = ((px_ - cx) ** 2 + (py - cy) ** 2) / half ** 2
            r2s = ((px_ - dx - cx) ** 2 + (py - dy - cy) ** 2) / half ** 2
            y = np.log(srgb_to_linear(gb[py, px_])) - np.log(srgb_to_linear(ga[py, px_]))
            A = np.c_[r2 - r2s, r2 ** 2 - r2s ** 2]
            rows_A.append(A - A.mean(0))
            rows_b.append(y - np.median(y))
            used.append({'t': round(i / 8, 3), 'shot': s['index']})

    def irls(As, bs):
        A_, y_ = np.concatenate(As), np.concatenate(bs)
        wgt = np.ones(len(y_))
        for _ in range(6):
            sol, *_ = np.linalg.lstsq(A_ * wgt[:, None], y_ * wgt, rcond=None)
            res_ = y_ - A_ @ sol
            sc = 1.4826 * np.median(np.abs(res_)) + 1e-9
            wgt = 1 / np.maximum(1, np.abs(res_) / (1.5 * sc))
        return sol

    V = lambda sol, r: math.exp(sol[0] * r ** 2 + sol[1] * r ** 4)
    sol = irls(rows_A, rows_b)
    boot = []
    for _ in range(200):
        pick = rng.integers(0, len(rows_A), len(rows_A))
        sb = irls([rows_A[k] for k in pick], [rows_b[k] for k in pick])
        boot.append([V(sb, r) for r in (0.5, 0.75, 1.0)])
    boot = np.array(boot)
    res = {'about': 'vignette V(r) (display-linear, 1 at centre, r = 1 at the corner of the 16:9 game frame) from trailer pans '
                    'in shots whose HUD stays on screen; bootstrap over pairs with the same robust estimator',
           'pairs': len(rows_A), 'shots': sorted({u['shot'] for u in used}), 'rejected_pairs_hud_moving': len(rejected),
           'a1': round(float(sol[0]), 4), 'a2': round(float(sol[1]), 4),
           'V': {f'{r:.2f}': round(V(sol, r), 3) for r in (0.25, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0)},
           'V_ci68': {k: [round(float(np.percentile(boot[:, i], 16)), 3), round(float(np.percentile(boot[:, i], 84)), 3)]
                      for i, k in enumerate(('0.50', '0.75', '1.00'))},
           'pairs_used': used, 'pairs_rejected': rejected}
    json.dump(res, open(os.path.join(OUT, 'vignette_pan.json'), 'w'), indent=1)
    print({k: v for k, v in res.items() if k not in ('pairs_used', 'pairs_rejected')})


def grain():
    """Film grain upper bound: high-pass residual (image minus Gaussian sigma 1.2 px, 8-bit code values) on the
    flattest 16x16 scene patches of the native screenshots (HUD masked), against flat UI panels (drawn after post, so
    JPEG noise only). Grain that survived JPEG would lift the scene floor above the UI floor."""
    from scipy.ndimage import gaussian_filter, uniform_filter
    rows = []
    for fid, rel, cond, label, extra in FRAMES + [('ss_01', 'screenshots/ss_01_8f2609d8.jpg', 'shop', '', [(350, 110, 1570, 960)])]:
        if not rel.startswith('screenshots/'):
            continue
        img = np.asarray(Image.open(os.path.join(SRC, rel)).convert('L')).astype(np.float64)
        mask = frame_mask(fid, rel, extra, img.shape + (3,))
        hp = img - gaussian_filter(img, 1.2)
        lo = gaussian_filter(img, 4.0)
        gy, gx = np.gradient(lo)
        structure = np.hypot(gx, gy)
        n = 16
        stats = []
        for y in range(0, img.shape[0] - n, n):
            for x in range(0, img.shape[1] - n, n):
                if not mask[y:y + n, x:x + n].all():
                    continue
                mean = img[y:y + n, x:x + n].mean()
                if mean < 25 or mean > 230:
                    continue
                stats.append((structure[y:y + n, x:x + n].mean(), hp[y:y + n, x:x + n].std(), mean))
        stats.sort()
        flat = np.array(stats[:max(20, len(stats) // 50)])
        rows.append({'frame': fid, 'patches': len(flat), 'hp_std_median': round(float(np.median(flat[:, 1])), 3),
                     'mean_level': round(float(np.median(flat[:, 2])), 1)})
        print(f"scene {fid:6s} flattest {len(flat):4d} patches: high-pass std {np.median(flat[:, 1]):.3f} at level {np.median(flat[:, 2]):.0f}")
    ui_rects = [('ss_03', 'screenshots/ss_03_36037296.jpg', (690, 845, 800, 885)),
                ('ss_03', 'screenshots/ss_03_36037296.jpg', (660, 790, 1240, 820)),
                ('ss_08', 'screenshots/ss_08_1502124d.jpg', (1318, 800, 1380, 845)),
                ('ss_01', 'screenshots/ss_01_8f2609d8.jpg', (1462, 234, 1474, 256))]
    ui = []
    for fid, rel, (x0, y0, x1, y1) in ui_rects:
        img = np.asarray(Image.open(os.path.join(SRC, rel)).convert('L')).astype(np.float64)
        hp = (img - gaussian_filter(img, 1.2))[y0:y1, x0:x1]
        ui.append(float(hp.std()))
    scene_floor = float(np.median([r['hp_std_median'] for r in rows]))
    ui_floor = float(np.median(ui))
    q = Image.open(os.path.join(SRC, 'screenshots/ss_04_344f0472.jpg')).quantization
    res = {'scene_flat_patches': rows, 'ui_hp_std': [round(v, 3) for v in ui],
           'scene_floor_hp_std': round(scene_floor, 3), 'ui_floor_hp_std': round(ui_floor, 3),
           'grain_rms_8bit_upper_bound': round(math.sqrt(max(scene_floor ** 2 - ui_floor ** 2, 0)), 3),
           'jpeg_luma_quant_dc_ac1': [int(q[0][0]), int(q[0][1])] if q else None}
    json.dump(res, open(os.path.join(OUT, 'grain.json'), 'w'), indent=1)
    print({k: v for k, v in res.items() if k != 'scene_flat_patches'})


def ui_type():
    """Text line heights (px at 1080p) in native UI panels: rows of bright glyph pixels (V >= 170) inside each panel,
    split into lines by the horizontal projection; a line's height is its ink extent (ascender to descender)."""
    panels = [('ss_03', 'screenshots/ss_03_36037296.jpg', (660, 180, 1250, 800), 'shop detail panel'),
              ('ss_03', 'screenshots/ss_03_36037296.jpg', (240, 110, 600, 960), 'home slots list'),
              ('ss_01', 'screenshots/ss_01_8f2609d8.jpg', (1000, 190, 1540, 840), 'groceries list'),
              ('ss_04', 'screenshots/ss_04_344f0472.jpg', (1640, 860, 1920, 1060), 'HUD stat bars')]
    out = []
    for fid, rel, (x0, y0, x1, y1), what in panels:
        img = np.asarray(Image.open(os.path.join(SRC, rel)).convert('RGB')).astype(np.float64)
        ink = img[y0:y1, x0:x1].max(2) >= 170
        rows = ink.sum(1) >= 3
        lines, start = [], None
        for i, r in enumerate(list(rows) + [False]):
            if r and start is None:
                start = i
            elif not r and start is not None:
                if i - start >= 6:
                    lines.append(i - start)
                start = None
        out.append({'frame': fid, 'what': what, 'line_ink_heights_px': lines,
                    'median_px': float(np.median(lines)) if lines else None})
        print(fid, what, lines)
    json.dump({'about': ui_type.__doc__.strip(), 'panels': out}, open(os.path.join(OUT, 'ui_type.json'), 'w'), indent=1)


if __name__ == '__main__':
    cmds = sys.argv[1:] or ['bands', 'lighting', 'lamps', 'vignette', 'vignette_pan', 'grain', 'ui_type']
    for c in cmds:
        {'bands': bands, 'lighting': lighting, 'lamps': lamps, 'vignette': vignette, 'vignette_pan': vignette_pan,
         'grain': grain, 'ui_type': ui_type}[c]()
