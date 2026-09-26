"""Colour grade (3D LUT) and exposure calibration for the three.js AgX pipeline (WP-P0-04).

Pipeline the LUT is built for (three.js r186):
    scene-linear sRGB -> AgXToneMapping (toneMappingExposure) -> OutputPass (sRGB OETF) -> LUTPass(.cube) -> screen
The LUT therefore maps display-referred, sRGB-encoded RGB to display-referred, sRGB-encoded RGB.

AgX base is reproduced here exactly (constants from three.js tonemapping_pars_fragment). The look is a small
parametric grade fitted to targets measured in the references (tools/targets/out/*.json):
  1. bright-light saturation: AgX drives bright, saturated light towards white; the source keeps warm lamp emitters
     saturated. Target: a 2700 K emitter whose display value reaches the measured emitter value must come out with the
     measured emitter chroma and hue (lamps.json, t069 / t077 emitters).
  2. neutral hue bias: near-neutral surfaces under near-neutral light (overcast dawn ss_06, snow t041) show a small
     warm-olive cast per luminance band (lighting.json neutral_tint_ab). The LUT adds that offset in CIELAB.
  3. no black lift: the darkest native frames reach code values 0-2.
Material saturation is left to albedo (see bands); rig intensities carry the scene contrast.

Writes assets/targets/lut/survival-log-grade-v1.cube (33^3), tools/targets/out/grade.json, tools/targets/out/rigs.json
and docs/art/grade/grade_chart.png.

    tools/targets/.venv/bin/python tools/targets/lut.py
"""

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.optimize import brentq, least_squares

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'targets', 'out')
LUT_DIR = os.path.join(ROOT, 'assets', 'targets', 'lut')
LUT_PATH = os.path.join(LUT_DIR, 'survival-log-grade-v2.cube')
BOARD = os.path.join(ROOT, 'docs', 'art', 'grade')
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
LUT_SIZE = 33


def cols(*c):
    """GLSL mat3(vec3, vec3, vec3) takes columns."""
    return np.array(c, dtype=np.float64).T


SRGB_TO_REC2020 = cols((0.6274, 0.0691, 0.0164), (0.3293, 0.9195, 0.0880), (0.0433, 0.0113, 0.8956))
REC2020_TO_SRGB = cols((1.6605, -0.1246, -0.0182), (-0.5876, 1.1329, -0.1006), (-0.0728, -0.0083, 1.1187))
AGX_INSET = cols((0.856627153315983, 0.137318972929847, 0.11189821299995),
                 (0.0951212405381588, 0.761241990602591, 0.0767994186031903),
                 (0.0482516061458583, 0.101439036467562, 0.811302368396859))
AGX_OUTSET = cols((1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
                  (-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
                  (-0.016493938717834573, -0.016493938717834257, 1.2519364065950405))
AGX_MIN_EV, AGX_MAX_EV = -12.47393, 4.026069
M_XYZ = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
WHITE = np.array([0.95047, 1.0, 1.08883])


def agx(rgb, exposure=1.0):
    """three.js AgXToneMapping: linear sRGB in, linear sRGB out (0..1)."""
    c = np.asarray(rgb, np.float64) * exposure
    c = c @ SRGB_TO_REC2020.T
    c = c @ AGX_INSET.T
    c = np.log2(np.maximum(c, 1e-10))
    c = np.clip((c - AGX_MIN_EV) / (AGX_MAX_EV - AGX_MIN_EV), 0, 1)
    x2 = c * c
    x4 = x2 * x2
    c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232
    c = c @ AGX_OUTSET.T
    c = np.power(np.maximum(c, 0), 2.2)
    c = c @ REC2020_TO_SRGB.T
    return np.clip(c, 0, 1)


def oetf(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def eotf(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def display(rgb, exposure=1.0):
    """What OutputPass hands to the LUT: sRGB-encoded AgX output."""
    return oetf(agx(rgb, exposure))


def to_lab(lin):
    xyz = np.asarray(lin) @ M_XYZ.T / WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def from_lab(lab):
    fy = (lab[..., 0] + 16) / 116
    fx = fy + lab[..., 1] / 500
    fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1)
    xyz = np.where(f > 6 / 29, f ** 3, 3 * (6 / 29) ** 2 * (f - 4 / 29)) * WHITE
    return xyz @ np.linalg.inv(M_XYZ).T


def planck_srgb(t):
    """Linear sRGB of a blackbody (Kim et al. 2002 Planckian locus fit), max channel 1."""
    if t <= 4000:
        x = -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.179910
    else:
        x = -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.240390
    if t <= 2222:
        y = -1.1063814 * x ** 3 - 1.34811020 * x ** 2 + 2.18555832 * x - 0.20219683
    elif t <= 4000:
        y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
    else:
        y = 3.0817580 * x ** 3 - 5.87338670 * x ** 2 + 3.75112997 * x - 0.37001483
    xyz = np.array([x / y, 1.0, (1 - x - y) / y])
    rgb = np.linalg.inv(M_XYZ) @ xyz
    rgb = np.maximum(rgb, 0)
    return rgb / rgb.max()


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def gamut_chroma(L, h, c_min):
    """Largest CIELAB chroma at (L*, hue) that stays inside linear sRGB [0, 1] (bisection from c_min)."""
    def inside(cc):
        rgb = from_lab(np.stack([L, cc * np.cos(h), cc * np.sin(h)], -1))
        return np.all((rgb >= -1e-5) & (rgb <= 1 + 1e-5), -1)
    lo, hi = np.asarray(c_min, float).copy(), np.full(np.shape(L), 220.0)
    for _ in range(22):
        m = (lo + hi) / 2
        good = inside(m)
        lo = np.where(good, m, lo)
        hi = np.where(good, hi, m)
    return lo


LUMA = np.array([0.2126, 0.7152, 0.0722])


def rotate_about_grey(d, theta):
    """Rodrigues rotation of chroma vectors d (..., 3) about the (1, 1, 1) axis by theta (radians, per pixel)."""
    k = np.ones(3) / math.sqrt(3)
    c, s = np.cos(theta)[..., None], np.sin(theta)[..., None]
    return d * c + np.cross(k, d) * s + k * (d @ k)[..., None] * (1 - c)


class Look:
    """Display-referred grade on sRGB-encoded values (what LUTPass sees after OutputPass). p = parameters."""

    def __init__(self, p):
        self.p = p
        # neutral tint as an encoded-RGB offset per luma, from the CIELAB offsets at L* bands
        ys = np.linspace(0, 1, 257)
        L = to_lab(eotf(np.repeat(ys[:, None], 3, 1)))[:, 0]
        ws = 1 - smooth(15, 35, L)
        wh = smooth(45, 75, L)
        wm = 1 - ws - wh
        da = ws * p['tint_shadow'][0] + wm * p['tint_mid'][0] + wh * p['tint_high'][0]
        db = ws * p['tint_shadow'][1] + wm * p['tint_mid'][1] + wh * p['tint_high'][1]
        fade = smooth(0.0, 6.0, L) * (1 - smooth(94.0, 100.0, L))
        tinted = oetf(np.clip(from_lab(np.stack([L, da * fade, db * fade], -1)), 0, 1))
        self.tint_y, self.tint_rgb = ys, tinted - ys[:, None]

    def __call__(self, srgb):
        p = self.p
        v = np.clip(np.asarray(srgb, np.float64), 0, 1)
        chroma = v.max(-1) - v.min(-1)
        # light-source saturation: gain rises with HSV value above the brightest diffuse surface in the references,
        # only on already-chromatic pixels (whites stay white)
        w = smooth(p['sat_v0'], p['sat_v1'], v.max(-1)) * smooth(0.08, 0.30, chroma)
        # luminance-preserving chroma gain in linear light (AgX output and the source emitters differ by a near
        # uniform scale of the linear chroma vector)
        lin = eotf(v)
        y = lin @ LUMA
        d = lin - y[..., None]
        hue = np.degrees(np.arctan2(math.sqrt(3) * (v[..., 1] - v[..., 2]), 2 * v[..., 0] - v[..., 1] - v[..., 2]))
        warm = np.cos(np.radians(hue - p['warm_hue_deg'])).clip(0, None) ** 4
        d = rotate_about_grey(d, np.radians(p['warm_hue_shift_deg']) * w * warm)
        g_t = 1 + (p['sat_gain'] - 1) * w
        # soft limit: the largest gain that keeps every channel inside [lin * (1 - k_down), lin + k_up * (1 - lin)],
        # approached asymptotically, so highlights keep their gradation and bright yellows do not collapse to primaries
        upper = lin + p['k_up'] * (1 - lin)
        lower = lin * (1 - p['k_down'])
        with np.errstate(divide='ignore', invalid='ignore'):
            lim = np.where(d > 1e-7, (upper - y[..., None]) / d,
                           np.where(d < -1e-7, (lower - y[..., None]) / d, np.inf))
        # smooth minimum over channels (p-norm) so the limiting channel can change without a kink
        lim = np.clip(lim, 1.0, 64.0)
        g_max = np.clip(np.sum(lim ** -8.0, -1) ** (-1 / 8.0), 1.0, 64.0)
        room = np.maximum(g_max - 1, 1e-6)
        g = 1 + room * (1 - np.exp(-(g_t - 1) / room))
        out = oetf(np.clip(y[..., None] + d * g[..., None], 0, 1))
        # neutral hue bias, only on near-neutral pixels
        k = 1 - smooth(0.04, 0.16, chroma)
        tint = np.stack([np.interp(v @ LUMA, self.tint_y, self.tint_rgb[:, c]) for c in range(3)], -1)
        out = out + k[..., None] * tint
        return np.clip(out, 0, 1)


def hsv_s(rgb):
    return (rgb.max(-1) - rgb.min(-1)) / np.maximum(rgb.max(-1), 1e-6)


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255


def emitter_targets():
    lamps = json.load(open(os.path.join(OUT, 'lamps.json')))['lamps']
    out = []
    for l in lamps:
        if l['id'] == 'lamp-t069':
            out.append((l['id'], hex_rgb(l['emitter_hex'])))
    return out


def fit_emitters(targets, bulb_k=2700):
    """Intensity of a bulb_k emitter that reaches the target display luminance through AgX; returns its AgX colour."""
    col = planck_srgb(bulb_k)
    rows = []
    for tid, tgt in targets:
        lum_t = float(eotf(tgt) @ [0.2126, 0.7152, 0.0722])
        f = lambda s: float(agx(col * s) @ [0.2126, 0.7152, 0.0722]) - lum_t
        s = brentq(f, 1e-4, 1e4)
        rows.append((tid, tgt, display(col * s), s))
    return col, rows


def diffuse_ceiling():
    """HSV value (0..1) of the brightest chromatic diffuse surface in the reference bands (largest per-sample p90 of
    V over the non-UI, non-glass samples with S >= 0.15): the light-source saturation boost starts above it."""
    bands = json.load(open(os.path.join(OUT, 'bands.json')))
    vals = [s['v'][2] for s in bands['samples'] if s['family'] not in ('ui', 'glass') and s['s'][1] >= 0.15]
    return float(max(vals)) / 255


def neutral_tints():
    light = json.load(open(os.path.join(OUT, 'lighting.json')))
    frames = {r['id']: r for r in light['frames']}
    bands = {'shadow': ('L0-20', 'L20-40'), 'mid': ('L40-60',), 'high': ('L60-101',)}
    res = {}
    for name, keys in bands.items():
        a, b = [], []
        for fid in ('ss_06', 't041'):
            for k in keys:
                t = frames[fid]['neutral_tint_ab'].get(k)
                if t:
                    a.append(t['a'])
                    b.append(t['b'])
        res[name] = [round(float(np.mean(a)), 2), round(float(np.mean(b)), 2)]
    return res


def fit_look():
    tints = neutral_tints()
    targets = emitter_targets()
    col, rows = fit_emitters(targets)
    v_diffuse = diffuse_ceiling()
    base = {'sat_v0': round(v_diffuse, 3), 'sat_v1': 0.97, 'sat_gain': 1.0, 'k_up': 0.85, 'k_down': 0.65, 'warm_hue_deg': 40.0, 'warm_hue_shift_deg': 0.0,
            'tint_shadow': tints['shadow'], 'tint_mid': tints['mid'], 'tint_high': tints['high']}

    def resid(x):
        p = dict(base, sat_gain=x[0], warm_hue_shift_deg=x[1])
        look = Look(p)
        r = []
        for tid, tgt, agx_disp, s in rows:
            got = to_lab(eotf(look(agx_disp[None, :])))[0]
            want = to_lab(eotf(tgt[None, :]))[0]
            r.extend([(got[0] - want[0]) / 3, (got[1] - want[1]) / 3, (got[2] - want[2]) / 3])
        return np.array(r)

    sol = least_squares(resid, [1.5, 0.0], bounds=([1.0, -30.0], [4.0, 30.0]))
    p = dict(base, sat_gain=round(float(sol.x[0]), 3), warm_hue_shift_deg=round(float(sol.x[1]), 2))
    report = {'bulb_k': 2700, 'bulb_linear_srgb': [round(float(v), 4) for v in col], 'targets': []}
    look = Look(p)
    for tid, tgt, agx_disp, s in rows:
        g = look(agx_disp[None, :])[0]
        report['targets'].append({
            'id': tid, 'target_hex': '#%02x%02x%02x' % tuple(np.round(tgt * 255).astype(int)),
            'agx_base_hex': '#%02x%02x%02x' % tuple(np.round(agx_disp * 255).astype(int)),
            'graded_hex': '#%02x%02x%02x' % tuple(np.round(g * 255).astype(int)),
            'emitter_scale_linear': round(s, 3),
            'S_target': round(float(hsv_s(tgt)), 3), 'S_agx_base': round(float(hsv_s(agx_disp)), 3),
            'S_graded': round(float(hsv_s(g)), 3)})
    return p, report


def write_cube(look, path):
    n = LUT_SIZE
    g = np.linspace(0, 1, n)
    b, gg, r = np.meshgrid(g, g, g, indexing='ij')
    grid = np.stack([r, gg, b], -1).reshape(-1, 3)
    out = np.clip(look(grid), 0, 1)
    lines = ['TITLE "Survival Log grade v2 (after three.js AgX + OutputPass, sRGB in/out)"',
             '# WP-P0-04. Generated by tools/targets/lut.py from the look references. Look reference only.',
             '# Apply with LUTCubeLoader + LUTPass placed after OutputPass.',
             f'LUT_3D_SIZE {n}', 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0']
    lines += [f'{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}' for v in out]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as fh:
        fh.write('\n'.join(lines) + '\n')
    identity_err = float(np.abs(out - grid).max())
    return identity_err


def apply_cube(path, srgb):
    """Trilinear lookup exactly as LUTPass samples it (red fastest)."""
    rows = [l for l in open(path).read().splitlines() if l and (l[0].isdigit() or l[0] == '-')]
    n = round(len(rows) ** (1 / 3))
    t = np.array([[float(x) for x in l.split()] for l in rows]).reshape(n, n, n, 3)  # [b][g][r]
    x = np.clip(srgb, 0, 1) * (n - 1)
    i0 = np.floor(x).astype(int).clip(0, n - 2)
    f = x - i0
    out = 0
    for dr in (0, 1):
        for dg in (0, 1):
            for db in (0, 1):
                w = (f[..., 0] if dr else 1 - f[..., 0]) * (f[..., 1] if dg else 1 - f[..., 1]) * (f[..., 2] if db else 1 - f[..., 2])
                out = out + w[..., None] * t[i0[..., 2] + db, i0[..., 1] + dg, i0[..., 0] + dr]
    return out


# ------------------------------------------------------------------------------------------------ exposure and rigs

def agx_inverse_grey(target_srgb):
    """Scene-linear grey whose AgX + OutputPass display value equals target_srgb (0..1, sRGB-encoded)."""
    lum_t = float(eotf(np.array(target_srgb)))
    f = lambda s: float(agx(np.array([s, s, s]))[1]) - lum_t
    return brentq(f, 1e-6, 1e3)


def E_of(display_8bit, albedo):
    """Irradiance (three.js units, exposure 1) that makes a Lambertian surface of this albedo display at the value."""
    return math.pi * agx_inverse_grey(display_8bit / 255) / albedo


def card(E):
    """sRGB code of a 0.18 grey card under irradiance E."""
    return round(float(display(np.array([0.18 * E / math.pi] * 3))[0] * 255), 1)


def rigs():
    """Rig table. Every value carries its source: 'measured' (a reference surface, inverted through AgX), 'derived'
    (computed from measured values, formula given) or 'decided' (a choice, reason given)."""
    bands = json.load(open(os.path.join(OUT, 'bands.json')))
    light = json.load(open(os.path.join(OUT, 'lighting.json')))
    lamps = {l['id']: l for l in json.load(open(os.path.join(OUT, 'lamps.json')))['lamps']}
    S = {s['id']: s for s in bands['samples']}
    F = {f['id']: f for f in light['frames']}
    img = np.asarray(Image.open(os.path.join(ROOT, 'assets', 'targets', 'source', 'trailer', 'shot_35_t059.417s.jpg')).convert('RGB'))

    def lum8(rect):
        x0, y0, x1, y1 = rect
        px = img[y0:y1, x0:x1].reshape(-1, 3) / 255
        return float(oetf(np.median(eotf(px) @ LUMA)) * 255)

    A = {}

    def anchor(key, what, lum, rho, kind):
        A[key] = {'what': what, 'display_srgb_lum': round(lum, 1), 'albedo_assumed': rho, 'anchor_kind': kind,
                  'E': round(E_of(lum, rho), 3), 'card_code': card(E_of(lum, rho))}

    # known-surface anchors
    lit, shade = lum8((1385, 495, 1410, 530)), lum8((1392, 560, 1425, 595))
    anchor('day_exterior_sunlit', 'roof concrete in sun beside the dish shadow, t059 (native)', lit, 0.35, 'surface')
    anchor('day_exterior_shade', 'same concrete inside the dish shadow, t059', shade, 0.35, 'surface')
    anchor('day_interior', 'bedroom plaster out of the lamp pool (plaster-t069-b), t069 Day 1 11:50 (native)', S['plaster-t069-b']['y_srgb'][1], 0.60, 'surface')
    anchor('dusk_interior', 'storeroom plaster (plaster-ss04-a), ss_04 Day 1 17:20 (native)', S['plaster-ss04-a']['y_srgb'][1], 0.60, 'surface')
    anchor('planning_t035', 'kitchen wall tiles, t035 (planning phase, countdown 03:28, time of day unknown)', S['tiles-t035-a']['y_srgb'][1], 0.75, 'surface')
    anchor('cold_wave_interior', 'kitchen wall tiles (tiles-t041-a), t041 Day 16 15:20 (native)', S['tiles-t041-a']['y_srgb'][1], 0.75, 'surface')
    anchor('night_lamps_wall', 'bedroom plaster at night, 0.95-2.1 m from the lamp (lamp-t033 patches), t033 (native)', lamps['lamp-t033']['ambient_display_srgb_lum'], 0.60, 'surface')
    # frame-statistic anchors: the frame's luminance percentile treated as a surface of albedo 0.30 (disclosed)
    anchor('dawn_frame', 'frame median, ss_06 Day 2 07:50 (native)', F['ss_06']['lum_srgb_p']['50'], 0.30, 'frame statistic')
    anchor('night_unlit_frame', 'frame p5, t033 (unlit corners of the night home, native)', F['t033']['lum_srgb_p']['5'], 0.30, 'frame statistic')
    anchor('storm_night_frame', 'frame median, ss_05 Day 16 03:40 rain (native)', F['ss_05']['lum_srgb_p']['50'], 0.30, 'frame statistic')
    anchor('day_exterior_frame', 'frame median, t059 (native), for the dawn/day ratio', F['t059']['lum_srgb_p']['50'], 0.30, 'frame statistic')
    anchor('night_exterior_punchin', 'frame median, t036 (HUD-less punch-in; not used for the standard)', F['t036']['lum_srgb_p']['50'], 0.30, 'frame statistic')
    t013 = F['t013']['lum_srgb_p']
    unusable = {'t013': f"blackout frame has a flat floor p1 {t013['1']} = p5 {t013['5']}: a screen-space darkness overlay, not scene light; not an anchor"}

    sun_share = 1 - E_of(shade, 0.35) / E_of(lit, 0.35)
    day_total = A['day_exterior_sunlit']['E']
    el_day, el_dusk, el_dawn, el_moon = 60, 12, 8, 45
    dusk_ratio = A['dusk_interior']['E'] / A['day_interior']['E']
    dawn_ratio = A['dawn_frame']['E'] / A['day_exterior_frame']['E']
    night = A['night_unlit_frame']['E']
    v = lambda value, src, **k: {'value': round(value, 3) if isinstance(value, float) else value, 'source': src, **k}
    R = {}
    lamp_I = rigs_lamp(lamps, A)
    lamp_share = lamp_I['calibration_target']['LAMPS_share_E']
    R['day'] = {
        'sun': {'cct_k': v(5500, 'decided: highlights of the native day frames read 6000-6030 K (t059, t032) and the sun sits a little warmer than the sky'),
                'azimuth_deg': v(15, 'decided: camera-facing walls in shade in t059 (native); sun behind the scene, right'),
                'elevation_deg': v(el_day, 'decided: short soft shadows in t059; not triangulated'),
                'E_normal': v(day_total * sun_share / math.sin(math.radians(el_day)), f'derived: E_sunlit {day_total:.3f} x sun share {sun_share:.3f} / sin {el_day}')},
        'sky': {'cct_k': v(7500, 'decided: clear-sky fill, standard daylight sky'),
                'E_horizontal': v(day_total * (1 - sun_share), f'derived: E_sunlit x (1 - sun share); shade/sunlit scene ratio {1 / (1 - sun_share):.2f}:1 (t059)')},
        'ground_bounce': {'cct_k': v(4000, 'decided: warm ground (concrete, wood, brick)'), 'E_horizontal': v(0.3 * day_total * (1 - sun_share), 'decided: 0.3 x sky')},
        'interior_bake_target_E': v(A['day_interior']['E'], 'measured: day_interior anchor'),
    }
    R['dawn'] = {
        'sun': {'cct_k': v(3500, 'decided: ss_06 is overcast and shows no sun disc or shadow; a weak warm sun keeps dawn distinct'),
                'azimuth_deg': v(75, 'decided: east of the view; azimuth decreases through the day'),
                'elevation_deg': v(el_dawn, 'decided'),
                'E_normal': v(0.4, 'decided: weak; no shadows in ss_06')},
        'sky': {'cct_k': v(6500, 'measured: ss_06 mean 6190 K, highlights 6470 K'),
                'E_horizontal': v(A['dawn_frame']['E'] - 0.4 * math.sin(math.radians(el_dawn)), 'derived: dawn_frame E minus the sun term')},
        'interior_bake_target_E': v(A['day_interior']['E'] * dawn_ratio, f'derived: day interior x dawn/day exterior ratio {dawn_ratio:.3f} (frame medians ss_06 / t059)'),
    }
    R['dusk'] = {
        'status': 'provisional: sun colour and direction rest on the HUD-less t049 punch-in; the only native dusk frame (ss_04, 17:20) is interior',
        'sun': {'cct_k': v(2600, 'provisional: t049 (punch-in) mean 2330 K, highlights 2460 K'),
                'azimuth_deg': v(285, 'provisional: slat shadows upper-left to lower-right in t049 (punch-in)'),
                'elevation_deg': v(el_dusk, 'decided'),
                'E_normal': v(day_total * sun_share / math.sin(math.radians(el_day)) * dusk_ratio, f'derived: day sun E_normal x dusk/day interior ratio {dusk_ratio:.3f} (ss_04 / t069)')},
        'sky': {'cct_k': v(8000, 'decided: blue sky opposite a low sun'), 'E_horizontal': v(day_total * (1 - sun_share) * dusk_ratio, 'derived: day sky x the same ratio')},
        'interior_DUSK_set_E': v(A['dusk_interior']['E'] - lamp_share,
                                 f'derived: the ss_04 anchor minus the LAMPS share {lamp_share:.3f} (the bed lamp is on in ss_04; upper bound from t033; '
                                 'P0-08 replaces it with the baked LAMPS value at that texel)'),
        'interior_with_lamps_E': v(A['dusk_interior']['E'], 'measured: dusk_interior anchor (ss_04 17:20, bed lamp on)'),
    }
    R['night_lamps'] = {
        'moon': {'cct_k': v(7000, 'decided: native night frames read 5440-5530 K overall with warm lamps in them (t033, ss_05)'),
                 'azimuth_deg': v(15, 'decided: same as the day sun'), 'elevation_deg': v(el_moon, 'decided'),
                 'E_normal': v(0.7 * A['storm_night_frame']['E'] / math.sin(math.radians(el_moon)), 'derived: 70 % (decided) of the native night exterior level (ss_05 frame median) on the moon')},
        'sky': {'cct_k': v(8000, 'decided'), 'E_horizontal': v(0.3 * A['storm_night_frame']['E'], 'derived: remaining 30 %')},
        'interior_NIGHT_set_E': v(night, 'measured (frame statistic): unlit corners of t033'),
        'interior_with_lamps_E': v(A['night_lamps_wall']['E'], 'measured: t033 plaster wall 0.95-2.1 m from the lamp'),
        'lamps': lamp_I,
    }
    R['night_exterior'] = {
        'status': 'provisional: t036 (the only street-at-night frame, 11 240 K, S50 0.93) is a HUD-less punch-in and is not used; the level comes from native ss_05',
        'moon': R['night_lamps']['moon'], 'sky': R['night_lamps']['sky'],
        'check_total_horizontal_E': v(R['night_lamps']['moon']['E_normal']['value'] * math.sin(math.radians(el_moon)) + R['night_lamps']['sky']['E_horizontal']['value'],
                                      'derived: moon x sin 45 + sky = the ss_05 anchor, no double count'),
    }
    R['blackout'] = {'interior_bake_target_E': v(night, 'derived: the NIGHT set with the LAMPS layer off'), 'note': unusable['t013']}
    R['storm'] = {
        'night_interior_E': v(night, 'decided: the NIGHT set (rain does not change the interior level)'),
        'night_exterior_E_horizontal': v(A['storm_night_frame']['E'], 'measured (frame statistic): ss_05'),
        'day_interior_E': v(A['cold_wave_interior']['E'], 'decided: equal to the overcast cold-wave interior (no native daytime storm frame)'),
        'sky_cct_k': v(7000, 'decided: ss_05 mean 5530 K includes warm windows; overcast sky slightly cool'),
        'lightning': v('DirectionalLight 8000 K, E 3.0, 80-150 ms, 1-3 flickers every 8-20 s', 'decided: no lightning in the references'),
    }
    R['cold_wave'] = {'sky_cct_k': v(6500, 'measured: t041 mean 6020 K, highlights 6320 K'),
                      'interior_bake_target_E': v(A['cold_wave_interior']['E'], 'measured: cold_wave_interior anchor')}
    R['dusk']['interior_light'] = dusk_interior_light(A, lamp_share, sun_share)
    R['hemisphere_fallback'] = hemisphere_fallback(R, A, night)
    R['fog'] = fog_table(R, A)
    R['emitter'] = emitter_spec()
    R['overcast'] = {'exterior_E_horizontal': v(A['cold_wave_interior']['E'], 'decided: the measured cold-wave level (t041 tiles under the open cutaway) stands for the overcast sky'),
                     'set': v('OVERCAST: uniform overcast sky dome + its bounce, no sun, normalised to 1.0 in the reference room', 'decided: overcast rigs must not reuse the DAY sun-bounce pattern')}
    for rig in R.values():
        for key, val in list(rig.items()):
            if isinstance(val, dict) and 'value' in val and isinstance(val['value'], float) and 'E' in key:
                val['card_code'] = card(val['value'])
    return {'about': rigs.__doc__.strip() + ' Units: three.js intensity at toneMappingExposure 1.0; radiance = albedo x E / pi.',
            'anchors': A, 'unusable': unusable, 'sun_share_of_horizontal_E': round(sun_share, 3), 'rigs': R,
            'agx_scene_grey_for_display_0.5': round(agx_inverse_grey(0.5), 4)}


def card_rho(E, rho):
    """sRGB code of a surface of albedo rho under irradiance E."""
    return float(display(np.array([rho * E / math.pi] * 3))[0] * 255)


def E_for_code(code, rho):
    return E_of(code, rho)


DUSK_PAIRS = [  # same material in the same home: (label, t069 rect (day 11:50), ss_04 rect (dusk 17:20))
    ('back-wall plaster', (1570, 160, 1625, 240), (1045, 20, 1095, 140)),
    ('concrete floor', (1080, 740, 1160, 800), (1000, 720, 1080, 800)),
    ('saw-table top', (800, 760, 860, 800), (760, 600, 820, 640)),
]


def scene_rgb(img, rect):
    """Scene-linear RGB behind a patch's median display colour, by inverting AgX in 3D."""
    x0, y0, x1, y1 = rect
    lin = np.median(eotf(img[y0:y1, x0:x1].reshape(-1, 3) / 255), axis=0)
    r = least_squares(lambda x: agx(np.exp(x)) - lin, np.log(np.full(3, 0.1)), bounds=(-14, 3))
    return np.exp(r.x)


def dusk_interior_light(A, lamp_share, sun_share):
    """Colour of the dusk interior light from ss_04 (17:20) against t069 (11:50): same materials, same home. The
    per-channel scene ratio dusk/day, times the day interior light colour as rigged (86.9 % 5500 K sun bounce +
    13.1 % 7500 K sky), gives the ss_04 light; removing the bed lamp's share (2700 K) gives the lamp-free DUSK set
    colour, which is then split into the dusk sun (2600 K) and sky (8000 K) by least squares on chromaticity."""
    src = os.path.join(ROOT, 'assets', 'targets', 'source')
    day = np.asarray(Image.open(os.path.join(src, 'trailer', 'shot_41_t068.883s.jpg')).convert('RGB')).astype(float)
    dusk = np.asarray(Image.open(os.path.join(src, 'screenshots', 'ss_04_344f0472.jpg')).convert('RGB')).astype(float)
    unit = lambda c: np.asarray(c, float) / float(np.asarray(c, float) @ LUMA)
    c_day = unit(sun_share * unit(planck_srgb(5500)) + (1 - sun_share) * unit(planck_srgb(7500)))
    pairs, ratios = [], []
    for label, r_day, r_dusk in DUSK_PAIRS:
        a, b = scene_rgb(day, r_day), scene_rgb(dusk, r_dusk)
        ratio = b / a
        ratios.append(unit(ratio))
        ct = unit(c_day * unit(ratio))
        cs = unit(ct * A['dusk_interior']['E'] - unit(planck_srgb(2700)) * lamp_share)
        kk = least_squares(lambda k: np.array(lin_xy(k[0] * unit(planck_srgb(2600)) + (1 - k[0]) * unit(planck_srgb(8000)))) - np.array(lin_xy(cs)), [0.5], bounds=(0, 1)).x[0]
        pairs.append({'material': label, 't069_rect': list(r_day), 'ss04_rect': list(r_dusk),
                      'dusk_set_cct_k': int(round(cct(cs), -1)), 'sun_share': round(float(kk), 2),
                      'luminance_ratio_dusk_over_day': round(float((b @ LUMA) / (a @ LUMA)), 3),
                      'chroma_ratio_rgb': [round(float(x), 3) for x in unit(ratio)]})
    ratio = unit(np.mean(ratios, axis=0))
    c_total = unit(c_day * ratio)
    E_tot = A['dusk_interior']['E']
    c_set = unit(c_total * E_tot - unit(planck_srgb(2700)) * lamp_share)
    sun, sky = unit(planck_srgb(2600)), unit(planck_srgb(8000))
    xy = lambda c: np.array(lin_xy(c))
    fit = least_squares(lambda k: xy(k[0] * sun + (1 - k[0]) * sky) - xy(c_set), [0.5], bounds=(0, 1))
    k = float(fit.x[0])
    hexc = lambda c: '#%02x%02x%02x' % tuple(np.round(oetf(np.clip(c / c.max(), 0, 1)) * 255).astype(int))
    return {'about': dusk_interior_light.__doc__.strip(), 'pairs': pairs,
            'ss04_light_rgb_unit_lum': [round(float(x), 3) for x in c_total], 'ss04_light_cct_k': int(round(cct(c_total), -1)),
            'dusk_set_rgb_unit_lum': [round(float(x), 3) for x in c_set], 'dusk_set_cct_k': int(round(cct(c_set), -1)),
            'dusk_set_hex': hexc(c_set),
            'dusk_set_label': 'measured light, CCT %d K (slightly off the blackbody curve; a %d K blackbody is %s)' % (
                int(round(cct(c_set), -1)), int(round(cct(c_set), -1)), hexc(unit(planck_srgb(int(round(cct(c_set), -1)))))),
            'sun_share_of_interior_light': round(k, 2), 'sky_share_of_interior_light': round(1 - k, 2),
            'literal_mix_cct_k': int(round(cct(round(k, 2) * sun + (1 - round(k, 2)) * sky), -1)),
            'literal_mix_mired_gap': round(abs(1e6 / cct(round(k, 2) * sun + (1 - round(k, 2)) * sky) - 1e6 / cct(c_set)), 1),
            'fit_residual_xy': round(float(np.linalg.norm(fit.fun)), 4)}


def lin_xy(c):
    X, Y, Z = M_XYZ @ np.asarray(c, float)
    return X / (X + Y + Z), Y / (X + Y + Z)


def cct(c):
    x, y = lin_xy(c)
    n = (x - 0.3320) / (0.1858 - y)
    return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33


def movables(A, albedo_json):
    """Movable objects (probe-lit): vertical-surface irradiance target in the day interior, and the display codes a
    material then shows. The day-interior anchor itself is a vertical wall (plaster-t069-b), so E 0.419 is a
    vertical-surface irradiance."""
    E = A['day_interior']['E']
    items = albedo_json['character_measured']['items']
    rows = {}
    for item in ('hoodie', 'jeans', 'hair', 'sneakers', 'face'):
        v_ = {x['frame']: x for x in items.get(item, [])}
        src = 't069' if 't069' in v_ else next(iter(v_))
        alb = v_[src]['albedo_luminance']
        rows[item] = {'albedo_from': src, 'albedo_luminance': alb,
                      'display_code_at_day_interior_vertical_E': round(card_rho(E, alb), 1),
                      'on_screen_by_frame': {f: x['display_hex'] for f, x in v_.items()}}
    hr = albedo_json['character_measured']['hair_relative']
    t = hr['targets'][hr['target_key']]
    rows['hair'] = {'albedo_from': f"hair_relative ({hr['target_key']}; dark cap core relative to the t069 hoodie)",
                    'albedo_luminance': t['albedo_luminance'],
                    'display_code_at_day_interior_vertical_E': t['expected_code_day_rig'],
                    'note': 'cap faces up: E 0.419 x k_up; the rim-lit per-frame values stay in character_measured.items.hair',
                    'on_screen_by_frame': rows['hair']['on_screen_by_frame']}
    return {'about': movables.__doc__.strip(), 'vertical_E_day_interior': E,
            'vertical_E_accept_codes_plaster_060': [round(card_rho(E, 0.60) - 5, 1), round(card_rho(E, 0.60) + 5, 1)],
            'items': rows}


def hemisphere_fallback(R, A, night):
    """HemisphereLight fallback for movables without a probe. Sky and ground colours are normalised to unit
    luminance (linear sRGB), so a vertical face (mean of sky and ground) receives exactly `intensity` = the rig's
    vertical target E."""
    unit = lambda c: np.asarray(c, float) / float(np.asarray(c, float) @ LUMA)
    ground = unit(planck_srgb(4000))
    dusk_c = np.array(R['dusk']['interior_light']['dusk_set_rgb_unit_lum'])
    rows = {}
    for rig, col, E, label in (('day', unit(planck_srgb(5500)), A['day_interior']['E'], '5500 K blackbody'),
                               ('dusk', unit(dusk_c), R['dusk']['interior_DUSK_set_E']['value'], 'measured dusk light, CCT 6900 K'),
                               ('night', unit(planck_srgb(8000)), night, '8000 K blackbody')):
        vert = float(((col + ground) / 2) @ LUMA) * E
        rows[rig] = {'color_linear_unit_lum': [round(float(x), 4) for x in col], 'color_is': label,
                     'groundColor_linear_unit_lum': [round(float(x), 4) for x in ground], 'groundColor_is': '4000 K blackbody',
                     'intensity': round(E, 3), 'vertical_face_E': round(vert, 3),
                     'note': 'set with Color.setRGB(r, g, b, THREE.LinearSRGBColorSpace)' + ('; add LAMPS where on' if rig == 'night' else '')}
    return {'about': hemisphere_fallback.__doc__.strip(), 'rigs': rows}


def fog_table(R, A):
    """FogExp2 colour as scene-linear radiance: sky colour (linear, max 1) x E_h x 0.5 / pi, i.e. the radiance of a
    50 % grey card under the sky; density reasons as fog fractions at the look point (10.47 m) and the far floor
    edge at 60 deg (38.6 m along the ray)."""
    def row(name, cct, E_h, density):
        c = planck_srgb(cct) * E_h * 0.5 / math.pi
        frac = lambda z: 1 - math.exp(-(density * z) ** 2)
        return {'rig': name, 'sky_cct_k': cct, 'E_h': round(E_h, 3), 'color_linear_rgb': [round(float(x), 4) for x in c],
                'density_per_m': density, 'fog_at_look_point': round(frac(10.47), 3), 'fog_at_far_floor_edge_60deg': round(frac(38.6), 3)}
    night = R['storm']['night_exterior_E_horizontal']['value']
    over = A['cold_wave_interior']['E']
    return {'about': fog_table.__doc__.strip(),
            'rows': [row('storm night', 7000, night, 0.012), row('storm day', 7000, over, 0.012), row('cold wave', 6500, over, 0.008)],
            'clear_weather': 'none (decided: no distance haze across the roofs in t059 or ss_06)',
            'density_reason': 'decided: storm 0.012 per m keeps the look point clear (1.6 %) and greys the far floor edge (19 %); '
                              'cold wave 0.008 is two-thirds of that (0.7 % / 9 %) because snow haze is thinner than rain'}


def emitter_spec():
    lum = float(planck_srgb(2700) @ LUMA)
    k = 3.0
    return {'display_color': '#daa850 (t069 shade)',
            'bloom_emissive': {'emissive': '2700 K #ffad59', 'emissiveIntensity': k, 'scene_luminance': round(k * lum, 3),
                               'source': f'decided: 2700 K emissive luminance {lum:.3f} x {k} = {k * lum:.2f}, 1.55x the bloom threshold 1.0, '
                                         'so shades bloom and diffuse surfaces (at most 0.64 in day sun) do not'}}


def calibration_target(A, I, t033):
    """LAMPS calibration for P0-08: at weight 1, t033's reference wall (plaster 0.60, 1.0-2.2 m from the lamp) must
    read the night-lamps anchor E 0.141 within +-5 codes; NIGHT supplies 0.101 of it. A bare point light at the
    t069-derived I overshoots, so table lamps get shades that block sideways light."""
    code = A['night_lamps_wall']['display_srgb_lum']
    E_set = A['night_unlit_frame']['E']
    lo, hi = E_for_code(code - 5, 0.60), E_for_code(code + 5, 0.60)
    rows = []
    for label, d, c in t033:
        direct = I / d ** 2
        rows.append({'patch': label, 'distance_m': d, 'bare_point_light_direct_E': round(direct, 3),
                     'predicted_total_E': round(E_set + direct, 3), 'predicted_code': round(card_rho(E_set + direct, 0.60), 1),
                     'measured_contrast': c})
    return {'target_E': A['night_lamps_wall']['E'], 'target_code_plaster_060': code,
            'accept_E_range': [round(lo, 3), round(hi, 3)], 'accept_code_range': [round(code - 5, 1), round(code + 5, 1)],
            'NIGHT_share_E': E_set, 'LAMPS_share_E': round(A['night_lamps_wall']['E'] - E_set, 3),
            'bare_point_light_check': rows,
            'bare_point_light_ratio_near_far': round(rows[0]['predicted_total_E'] / rows[1]['predicted_total_E'], 2),
            'source': 'measured anchor (t033); the bare point light at I from t069 fails it, so shades are required (decided)'}


def rigs_lamp(lamps, A):
    """Lamp intensity from the native t069 pool: I = (C - 1) x E_ambient x d^2 for each lit patch (normal incidence
    on the wall), E_ambient = day_interior. Geometry (bulb height, patch distances) as in lamps.json."""
    l = lamps['lamp-t069']
    E_amb = A['day_interior']['E']
    est = [{'patch': p['label'], 'distance_m': p['distance_from_bulb_m'], 'contrast': p['scene_contrast_vs_ambient'],
            'I': round((p['scene_contrast_vs_ambient'] - 1) * E_amb * p['distance_from_bulb_m'] ** 2, 3)} for p in l['patches']]
    I = float(np.exp(np.mean([math.log(e['I']) for e in est])))
    t033 = [(p['label'], p['distance_from_bulb_m'], p['scene_contrast_vs_ambient']) for p in lamps['lamp-t033']['patches']]
    flash_rho, flash_d = 0.40, 1.3 / math.sin(math.radians(35))
    flash_cos = math.cos(math.radians(55))
    E_clip = E_of(250, flash_rho)
    I_flash = E_clip * flash_d ** 2 / flash_cos
    old_I = E_clip * flash_d ** 2
    old_disp = card_rho(old_I * flash_cos / flash_d ** 2, flash_rho)
    return {
        'table_lamp': {'I': {'value': round(I, 3), 'source': 'derived: geometric mean of the per-patch estimates (working below)', 'working': est},
                       'night_check': {'value': t033,
                                       'source': 'measured: t033 wall reads 1.03-1.09:1 across 0.95-2.1 m, so the night pool is soft; inverse-square falloff is not claimed'},
                       'cct_k': {'value': 2700, 'source': 'decided: warm bulb; the shade displays #daa850 (t069, lamps.json emitter_hex) via the emitter layer'},
                       'geometry': {'value': 'bulb 0.95 m above the floor (table) or 1.5 m (floor lamp); decay 2; distance 6 m', 'source': 'decided'}},
        'calibration_target': calibration_target(A, I, t033),
        'wall_lamp': {'I': {'value': round(I, 3), 'source': 'decided: same bulb as the table lamp (no native wall-lamp frame; t077 is a punch-in)'},
                      'geometry': {'value': 'SpotLight at 1.9 m, aimed 35 deg down, angle 50 deg, penumbra 0.6, decay 2, distance 8 m', 'source': 'decided'}},
        'flashlight': {'I': {'value': round(I_flash, 1),
                             'source': f'derived: the pool centre must clip like t013 (display >= 250 on a {flash_rho} floor): E = {E_clip:.1f}; '
                                       f'I = E x d^2 / cos 55 (floor incidence), d = 1.3 / sin 35 = {flash_d:.2f} m; without the cosine I = {old_I:.0f}, which displays at {old_disp:.0f}'},
                       'I_without_cosine': round(old_I, 1), 'display_without_cosine': round(old_disp, 1),
                       'cct_k': {'value': 6500, 'source': 'measured: t013 pool edge 6540 K (display)'},
                       'geometry': {'value': 'SpotLight held at 1.3 m, aimed 35 deg down, angle 22 deg, penumbra 0.35, decay 2, distance 10 m', 'source': 'decided'}},
    }


CONDITION_E = {'day-interior': 'day_interior', 'day-exterior': 'day_exterior_sunlit', 'planning-time-unknown': 'planning_t035',
               'dusk-interior': 'dusk_interior', 'night-lamps': 'night_lamps_wall', 'cold-snow': 'cold_wave_interior',
               'night-rain': 'storm_night_frame'}
ANCHORS = {'plaster-t069-b': 'calibration anchor (returns its assumed 0.60)', 'plaster-ss04-a': 'calibration anchor (returns its assumed 0.60)',
           'tiles-t035-a': 'calibration anchor (returns its assumed 0.75)', 'tiles-t041-a': 'calibration anchor (returns its assumed 0.75)'}
# samples whose light is not the condition's calibrated irradiance
NOT_LAMBERT = {'metal': 'specular family (use F0 / roughness, not albedo)', 'glass': 'specular family'}
LOCAL_LIGHT = {
    'fabric-t033-a': 'next to the table lamp (local E far above the night ambient)',
    'fabric-t033-b': 'next to the table lamp',
    'tiles-t033-a': 'next to the table lamp',
    'tiles-t033-b': 'next to the table lamp',
    'skin-ss02-a': 'under the terrace pergola, not in full sun',
    'skin-ss02-b': 'under the terrace pergola, not in full sun',
    'wood-ss02-a': 'sun through slats, mixed sun and shade',
    'blood-t041-a': 'on snow: strong snow bounce',
    'blood-t041-b': 'on snow: strong snow bounce',
    'plaster-t069-a': 'inside the t069 table-lamp pool',
    'tiles-t049-a': 'orange-cast punch-in without a neutral or irradiance anchor in frame',
    'foliage-t049-a': 'orange-cast punch-in without a neutral or irradiance anchor in frame',
}


def albedo(rig):
    """Implied albedo per band sample: pi * AgX^-1(display) / E(condition). Anchored on the rig calibration, so it is
    relative to plaster 0.60, white tile 0.75 and roof concrete 0.35; samples partly in shade read low."""
    bands = json.load(open(os.path.join(OUT, 'bands.json')))
    light = {f['id']: f for f in json.load(open(os.path.join(OUT, 'lighting.json')))['frames']}
    white_refs = {'t035': 'tiles-t035-a', 't041': 'tiles-t041-a'}

    def implied(s):
        lin = np.array(s['mean_linear_rgb'])
        scene = least_squares(lambda x: agx(np.exp(x)) - lin, np.log(np.full(3, 0.1)), bounds=(-14, 3)).x
        return np.exp(scene) * math.pi / rig['anchors'][CONDITION_E[s['condition']]]['E']

    by_id = {s['id']: s for s in bands['samples']}
    rows, fams = [], {}
    for s in bands['samples']:
        key = CONDITION_E.get(s['condition'])
        if s['family'] == 'ui' or not key:
            continue
        E_ = rig['anchors'][key]['E']
        rgb = implied(s)
        y = float(rgb @ LUMA)
        # white balance: the frame's own white reference if it has one, else a blackbody at the frame's highlight CCT
        if s['image'] in white_refs:
            w = implied(by_id[white_refs[s['image']]])
            wb_from = white_refs[s['image']]
        else:
            cct = light.get(s['image'], {}).get('highlight_cct_k', 6500)
            w = planck_srgb(cct)
            wb_from = f'{cct} K blackbody'
        w = w / float(w @ LUMA)
        wb = np.clip(rgb / w, 0, 1)
        wb_enc = oetf(wb)
        why = NOT_LAMBERT.get(s['family']) or LOCAL_LIGHT.get(s['id']) or ANCHORS.get(s['id'])
        rows.append({'id': s['id'], 'family': s['family'], 'condition': s['condition'], 'E': E_,
                     'albedo_linear_rgb': [round(float(v), 3) for v in rgb], 'albedo_luminance': round(y, 3),
                     'albedo_srgb_hex': '#%02x%02x%02x' % tuple(np.round(oetf(np.clip(rgb, 0, 1)) * 255).astype(int)),
                     'albedo_wb_hex': '#%02x%02x%02x' % tuple(np.round(wb_enc * 255).astype(int)),
                     'albedo_wb_hsv_s': round(float(hsv_s(wb_enc)), 3), 'white_balance_from': wb_from,
                     'display_hex': s['mean_hex'], 'valid': why is None, 'excluded_because': why})
        if why is None:
            fams.setdefault(s['family'], []).append((y, float(hsv_s(wb_enc)), '#%02x%02x%02x' % tuple(np.round(wb_enc * 255).astype(int))))
    summary = {f: {'n': len(v), 'albedo_luminance_min_median_max': [round(min(a[0] for a in v), 3), round(float(np.median([a[0] for a in v])), 3), round(max(a[0] for a in v), 3)],
                   'white_balanced_S_min_max': [round(min(a[1] for a in v), 2), round(max(a[1] for a in v), 2)],
                   'white_balanced_hex': [a[2] for a in v]}
               for f, v in fams.items()}
    li, dk = by_id['tiles-t033-a']['y_srgb'][1], by_id['tiles-t033-b']['y_srgb'][1]
    checker = {'light_display': li, 'dark_display': dk,
               'display_linear_ratio': round(float(eotf(li / 255) / eotf(dk / 255)), 2),
               'scene_ratio': round(agx_inverse_grey(li / 255) / agx_inverse_grey(dk / 255), 2)}
    chars = {}
    for name, rgb in (('office trousers', (52, 52, 52)), ('leather shoes', (36, 36, 36)), ('belt', (38, 38, 38)),
                      ('socks', (34, 34, 34)), ('skin mean', (196, 150, 126)), ('shirt', (212, 212, 212))):
        lin = eotf(np.array(rgb) / 255)
        chars[name] = {'albedo_srgb': list(rgb), 'albedo_linear_luminance': round(float(lin @ LUMA), 4)}
    return {'about': albedo.__doc__.strip(), 'families': summary, 'checker_t033': checker,
            'character_targets_p0_09': {'source': 'requested by WP-P0-09 (character lane) for an office outfit; grey values given as one sRGB code. '
                                                  'Shirt, trousers, belt and socks are SUPERSEDED: the source survivor wears a hoodie, jeans and sneakers '
                                                  '(character_measured below); skin mean is kept', 'values': chars},
            'character_measured': character_measured(rows),
            'material_families': material_families(rows),
            'samples': rows}


# WP-P0-05b's derived bands (tools/materials/hooks/art-metrics-family-bands.patch on wp/P0-05b), for comparison
LANE_BANDS = {
    'grout': ([0.30, 0.45], [0.80, 0.95]), 'concrete': ([0.20, 0.35], [0.70, 0.90]), 'leather': ([0.02, 0.30], [0.40, 0.60]),
    'laminate': ([0.25, 0.39], [0.45, 0.65]), 'rubber': ([0.013, 0.05], [0.40, 0.60]), 'cardboard': ([0.20, 0.35], [0.85, 0.95]),
    'plastic': ([0.02, 0.80], [0.35, 0.60]), 'concrete_exterior': (None, None), 'bark': ([0.08, 0.20], [0.70, 0.90]), 'soil': ([0.05, 0.20], [0.80, 0.97]),
    'newsprint': ([0.45, 0.65], [0.85, 0.95]), 'rattan': ([0.25, 0.45], [0.45, 0.65]),
}
# decided values: (albedo band or None to measure, roughness band, reason)
FAMILY_RULES = {
    'grout': (None, [0.80, 0.95], 'albedo: ART.md 7.2 grout 0.30-0.45 (decided); roughness decided: cementitious, no highlights like plaster'),
    'concrete': (None, [0.70, 0.90], 'interior floor slab (dirty or sealed); the library material `concrete`. Roughness decided: no highlights on the storeroom floor (t069, ss_04)'),
    'concrete_exterior': ([0.25, 0.40], [0.70, 0.90], 'exterior paving and roof concrete (weathered): target 0.35, the day anchor (roof concrete, also up-facing), band decided; the shell site pavers stay 0.35'),
    'leather': ([0.02, 0.30], [0.40, 0.60], 'decided: no leather in the references; black leather at the floor, tan up to the clothing band 0.30; ART.md leather roughness'),
    'laminate': ([0.25, 0.39], [0.45, 0.65], 'provisional: wood-print decor, so a copy of the wood-floor row, which is derived under a vertical anchor (see correction)'),
    'rubber': (None, [0.60, 0.85], 'roughness decided: worn, dusty tyres and mats show no highlight in t035; sneaker soles keep 0.4-0.6 (character band)'),
    'cardboard': (None, [0.85, 0.95], 'roughness decided: matte kraft, no highlights (ss_04)'),
    'plastic': (None, [0.35, 0.60], 'roughness decided: housings show a soft sheen (t069 AC unit); albedo spans dark to white plastics, capped at the 0.70 hard limit (aged white plastic greys; only white enamel goes higher)'),
    'bark': ([0.08, 0.20], [0.70, 0.90], 'decided: trunks are too small to sample (t059 tree); typical dry bark'),
    'soil': (None, [0.80, 0.97], 'roughness decided: dry potting soil, no highlights'),
    'newsprint': (None, [0.85, 0.95], 'roughness decided: uncoated paper'),
    'rattan': ([0.25, 0.45], [0.45, 0.65], 'decided: no rattan in the references; natural cane with a light lacquer'),
}


NEWSPRINT_ANCHOR = 0.60  # decided: grey newsprint reflectance, the horizontal white reference in t069


def material_families(rows):
    """Albedo and roughness bands for the families ART.md 7.2 had no band for (WP-P0-04d).

    Horizontal surfaces in t069 read far brighter per unit albedo than the vertical plaster anchor (newsprint on the
    floor implies 1.5 at E 0.419), so each family is measured against a reference of the same orientation in the
    same frame: newsprint (decided 0.60) sets the horizontal factor k_h in t069; concrete is relative to it; the
    ss_04 cardboard top is relative to the ss_04 floor concrete, which takes the t069 concrete value (same floor);
    the t035 tyre uses the t069 factor (cross-frame, low confidence); the ss_02 soil uses the day-exterior anchor,
    itself a horizontal surface (a lower bound if the planter is shaded). Measured bands span 0.8 x min to 1.25 x max
    of the samples (decided spread). Roughness is decided for every family."""
    by = {}
    for r in rows:
        if r['family'].startswith('mf-'):
            by.setdefault(r['family'][3:], []).append(r)
    Y = lambda fam, frame=None: [r['albedo_luminance'] for r in by.get(fam, []) if frame is None or r['id'].split('-')[2] == frame]
    news = float(np.median(Y('newsprint', 't069')))
    k_h = news / NEWSPRINT_ANCHOR
    conc = [y / k_h for y in Y('concrete', 't069')]
    conc_med = float(np.median(conc))
    ss04_conc = float(np.median(Y('concrete', 'ss04')))
    card = [conc_med * y / ss04_conc for y, r in zip(Y('cardboard'), by['cardboard']) if r['id'].endswith('-1')]
    rubber = [y / k_h for y in Y('rubber')]
    soil = Y('soil')
    measured = {'concrete': (conc, 'relative to t069 newsprint (horizontal)'),
                'cardboard': (card, 'box top relative to the ss_04 floor concrete (both horizontal), concrete from t069'),
                'rubber': (rubber, 't035 tyre top / k_h(t069); cross-frame, low confidence'),
                'soil': (soil, 'ss_02 planter under the sunlit day-exterior anchor; a lower bound if shaded')}
    band = lambda ys: [round(max(0.013, 0.8 * min(ys)), 3), round(min(0.90, 1.25 * max(ys)), 3)]
    out = {}
    for fam, (alb_rule, rough, reason) in FAMILY_RULES.items():
        lane_a, lane_r = LANE_BANDS[fam]
        samples = [{'id': r['id'], 'condition': r['condition'], 'implied_albedo_at_anchor_E': r['albedo_luminance'],
                    'display_hex': r['display_hex']} for r in by.get(fam, [])]
        ys, how = measured.get(fam, (None, None))
        if fam == 'newsprint':
            alb, label, med = lane_a, 'decided anchor 0.60 (inside the lane band)', NEWSPRINT_ANCHOR
        elif fam == 'plastic':
            alb, label, med = [0.02, 0.70], 'decided (the t069 AC housing implies 1.08 at the vertical anchor: lit above it near the open top, unusable)', None
        elif fam == 'grout':
            alb, label, med = [0.30, 0.45], 'decided (ART.md 7.2)', None
        elif ys:
            med = float(np.median(ys))
            alb, label = band(ys), 'measured: ' + how
            if fam == 'soil':
                alb = [alb[0], max(alb[1], lane_a[1])]
                label += '; upper end kept at the lane value because shade is unknown'
            if fam == 'rubber' and lane_a[0] <= med <= lane_a[1]:
                alb, label = lane_a, label + '; inside the lane band, which is kept (confirmed)'
        else:
            alb, label, med = alb_rule, 'provisional' if fam == 'laminate' else 'decided', None
        if lane_a is None:
            out[fam] = {'albedo': alb, 'albedo_srgb': [round(float(oetf(np.array(v)) * 255)) for v in alb], 'albedo_label': 'decided',
                        'target': 0.35, 'roughness': rough, 'roughness_label': 'decided', 'reason': reason, 'samples': [],
                        'lane_band': None, 'matches_lane': None}
            continue
        inside = med is None or lane_a[0] <= med <= lane_a[1]
        out[fam] = {'albedo': alb, 'albedo_srgb': [round(float(oetf(np.array(v)) * 255)) for v in alb], 'albedo_label': label,
                    'measured_values': [round(y, 3) for y in ys] if ys else None, 'measured_median': round(med, 3) if med is not None else None,
                    'roughness': rough, 'roughness_label': 'decided', 'reason': reason, 'samples': samples,
                    'lane_band': {'albedo': lane_a, 'roughness': lane_r},
                    'matches_lane': {'albedo': bool(inside and abs(alb[0] - lane_a[0]) <= 0.05 and abs(alb[1] - lane_a[1]) <= 0.1),
                                     'albedo_median_inside_lane_band': bool(inside), 'roughness': rough == lane_r}}
    card_y = Y('cardboard', 'ss04')
    return {'about': material_families.__doc__.strip(), 'k_h_t069': round(k_h, 3), 'newsprint_implied_t069': round(news, 3),
            'ss04_box_top_to_side': round(card_y[0] / card_y[1], 2),
            'families': out,
            'up_facing_correction': up_facing_correction(rows, k_h)}


RENDERER_UP_TO_VERTICAL = 1.5  # indicative: P0-13 day and overcast bakes, floor-to-wall irradiance; zone normalisation affects it


def up_facing_correction(rows, k_h):
    """On-screen match needs source up/vertical ratio / renderer's, not k_h alone. Floors derived under a vertical anchor
    (t035 wood floor, relative to its wall tiles) would drop by the renderer ratio; same-orientation (physical) bands render
    at renderer/source of the reference unless the renderer's up-facing light rises. Policy chosen in P0-04e."""
    wood = {r['id']: r['albedo_luminance'] for r in rows if r['id'] in ('wood-t035-a', 'wood-t035-b')}
    return {'source_up_to_vertical_t069': round(k_h, 3), 'renderer_up_to_vertical_indicative': RENDERER_UP_TO_VERTICAL,
            'wood_floor_t035_vertical_anchor': {k: round(v, 3) for k, v in wood.items()},
            'wood_floor_on_screen_equivalent': sorted(round(v / RENDERER_UP_TO_VERTICAL, 3) for v in wood.values()),
            'same_orientation_render_factor': round(RENDERER_UP_TO_VERTICAL / k_h, 3),
            'about': up_facing_correction.__doc__.strip()}


def character_measured(rows):
    """Survivor clothing, hair and face from the source frames (regions.json family 'character'), per item: on-screen
    display value, and albedo under the frame's own anchor (t069 is the day-interior rig itself; t035 relative to
    its white tiles; ss_04 under the dusk anchor with the bed lamp on). The t069 value is the albedo target."""
    out = {}
    for r in rows:
        if r['family'] != 'character':
            continue
        item = r['id'].split('-')[1]
        out.setdefault(item, []).append({'frame': r['id'].split('-')[2], 'condition': r['condition'], 'display_hex': r['display_hex'],
                                         'albedo_luminance': r['albedo_luminance'], 'albedo_wb_hex': r['albedo_wb_hex'],
                                         'albedo_srgb_value': round(float(oetf(np.array(r['albedo_luminance'])) * 255))})
    return {'about': character_measured.__doc__.strip(), 'items': out, 'hair_relative': hair_relative(out)}


HAIR_K_UP = (1.0, 1.25, 1.5)  # decided: up-facing cap / vertical hoodie irradiance, low, central, high


def hair_relative(items):
    """Hair albedo relative to the hoodie in the same frame (same light, same character): the dark cap core (the
    darker half of the head pixels, which drops the lit rim) against the hoodie median, both inverted through AgX,
    times the t069 hoodie albedo, divided by k_up, the extra light an up-facing cap gets over a vertical hoodie
    (decided 1.25, bracket 1.0-1.5). Expected code under the day rig: the cap at E 0.419 x k_up."""
    src = os.path.join(ROOT, 'assets', 'targets', 'source')
    reg = json.load(open(os.path.join(ROOT, 'tools', 'targets', 'regions.json')))
    S = {x['id']: x for x in reg['samples']}
    hoodie_alb = next(x['albedo_luminance'] for x in items['hoodie'] if x['frame'] == 't069')
    frames = []
    for f, key in (('t035', 't035'), ('t069', 't069'), ('ss04', 'ss_04')):
        im = np.asarray(Image.open(os.path.join(src, reg['images'][key])).convert('RGB')).astype(float) / 255

        def lum(rect, dark_half=False):
            x0, y0, x1, y1 = rect
            px = eotf(im[y0:y1, x0:x1].reshape(-1, 3)) @ LUMA
            if dark_half:
                px = px[px <= np.percentile(px, 50)]
            return float(oetf(np.median(px)) * 255)
        hair, hood = lum(S[f'char-hair-{f}']['rect'], True), lum(S[f'char-hoodie-{f}']['rect'])
        ratio = agx_inverse_grey(hair / 255) / agx_inverse_grey(hood / 255)
        frames.append({'frame': f, 'hair_core_code': round(hair, 1), 'hoodie_code': round(hood, 1), 'scene_ratio_hair_over_hoodie': round(ratio, 3)})
    ratios = [x['scene_ratio_hair_over_hoodie'] for x in frames]
    E = 0.419
    out = {}
    for k in HAIR_K_UP:
        alb = hoodie_alb * float(np.median(ratios)) / k
        out[f'k_up_{k}'] = {'albedo_luminance': round(alb, 3), 'albedo_srgb_value': round(float(oetf(np.array(alb)) * 255)),
                            'expected_code_day_rig': round(card_rho(E * k, alb), 1)}
    hoodie_code = round(card_rho(E, hoodie_alb), 1)
    return {'about': hair_relative.__doc__.strip(), 'frames': frames, 'median_ratio': round(float(np.median(ratios)), 3),
            'ratio_range': [min(ratios), max(ratios)], 'hoodie_albedo_t069': hoodie_alb, 'hoodie_expected_code_day_rig': hoodie_code,
            'targets': out, 'target_key': 'k_up_1.25', 'hue': 'neutral: white-balanced t069 hair #778795',
            'confidence': 'low: small heads (a few hundred pixels), k_up decided, JPEG/H.264 in dark tones'}


def chart(look, path):
    font = ImageFont.truetype(FONT, 14)
    sw, pad = 44, 6
    evs = np.arange(-8, 7)
    checker = [(115, 82, 68), (194, 150, 130), (98, 122, 157), (87, 108, 67), (133, 128, 177), (103, 189, 170),
               (214, 126, 44), (80, 91, 166), (193, 90, 99), (94, 60, 108), (157, 188, 64), (224, 163, 46),
               (56, 61, 150), (70, 148, 73), (175, 54, 60), (231, 199, 31), (187, 86, 149), (8, 133, 161),
               (243, 243, 242), (200, 200, 200), (160, 160, 160), (122, 122, 121), (85, 85, 85), (52, 52, 52)]
    kelvins = [1900, 2200, 2700, 3200, 4000, 5000, 6500, 8000, 10000]
    rows = []
    grey = np.array([[0.18 * 2.0 ** e] * 3 for e in evs])
    rows.append(('grey card 0.18 x 2^EV, EV -8..+6', grey))
    cc = eotf(np.array(checker) / 255)
    rows.append(('ColorChecker albedo, lit at E = pi (exposure 1)', cc))
    rows.append(('ColorChecker albedo, 2 EV darker', cc / 4))
    for inten in (0.5, 4.0, 32.0):
        rows.append((f'blackbody 1900-10000 K emitters, intensity {inten}', np.array([planck_srgb(k) * inten for k in kelvins])))
    W = 60 + 24 * (sw + pad) + 40
    H = 30 + len(rows) * 2 * (sw + 22) + 20
    im = Image.new('RGB', (W, H), (26, 26, 28))
    dr = ImageDraw.Draw(im)
    y = 10
    for label, sc in rows:
        a = display(sc)
        g = look(a)
        for name, disp in (('AgX base', a), ('AgX + LUT', g)):
            dr.text((10, y), f'{label}: {name}', fill=(230, 230, 230), font=font)
            y += 18
            for i, c in enumerate(disp):
                x = 60 + i * (sw + pad)
                dr.rectangle([x, y, x + sw, y + sw], fill=tuple(int(round(v * 255)) for v in c))
            y += sw + 4
    im.save(path)


COLORCHECKER = [(115, 82, 68), (194, 150, 130), (98, 122, 157), (87, 108, 67), (133, 128, 177), (103, 189, 170),
                (214, 126, 44), (80, 91, 166), (193, 90, 99), (94, 60, 108), (157, 188, 64), (224, 163, 46),
                (56, 61, 150), (70, 148, 73), (175, 54, 60), (231, 199, 31), (187, 86, 149), (8, 133, 161),
                (243, 243, 242), (200, 200, 200), (160, 160, 160), (122, 122, 121), (85, 85, 85), (52, 52, 52)]


def de76(a, b):
    return np.linalg.norm(to_lab(eotf(a)) - to_lab(eotf(b)), axis=-1)


def grade_stats(look, day_E):
    """Every LUT statistic quoted in ART.md, from the committed .cube (trilinear, as LUTPass samples it)."""
    import glob
    rng = np.random.default_rng(0)
    uni = rng.random((50000, 3))
    alb = rng.random((50000, 3)) ** 2.2 * 0.9
    light = np.array([planck_srgb(t) for t in rng.uniform(2000, 9000, 50000)])
    scene = display(alb * light * (2.0 ** rng.uniform(-6, 4, 50000))[:, None] * 0.9)
    out = {}
    for name, x in (('uniform_rgb', uni), ('synthetic_scene', scene)):
        e = np.abs(apply_cube(LUT_PATH, x) - look(x)).max(1) * 255
        out[f'lookup_error_codes_{name}'] = {'p99': round(float(np.percentile(e, 99)), 2), 'max': round(float(e.max()), 2)}
    tot = c2 = c10 = 0
    for f in sorted(glob.glob(os.path.join(ROOT, 'assets', 'targets', 'source', 'screenshots', '*.jpg'))):
        im = np.asarray(Image.open(f).convert('RGB')).reshape(-1, 3) / 255
        ch = np.abs(apply_cube(LUT_PATH, im) - im).max(1)
        tot += len(ch)
        c2 += int((ch > 2 / 255).sum())
        c10 += int((ch > 10 / 255).sum())
    out['screenshots_pixels_changed'] = {'more_than_2_codes': round(c2 / tot, 4), 'more_than_10_codes': round(c10 / tot, 4)}
    cc = display(eotf(np.array(COLORCHECKER) / 255) * day_E / math.pi)
    d = de76(apply_cube(LUT_PATH, cc), cc)
    out['sunlit_colorchecker_dE76'] = {'max': round(float(d.max()), 2), 'mean': round(float(d.mean()), 2), 'limit': 2.0, 'pass': bool(d.max() <= 2.0)}
    tan = np.array([[0xd2, 0xaa, 0x78]]) / 255
    out['sunlit_tan_d2aa78_dE76'] = round(float(de76(apply_cube(LUT_PATH, tan), tan)[0]), 2)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BOARD, exist_ok=True)
    tints = neutral_tints()
    p = {'sat_v0': 0.68, 'sat_v1': 0.97, 'sat_gain': 1.0, 'k_up': 0.85, 'k_down': 0.65, 'warm_hue_deg': 40.0,
         'warm_hue_shift_deg': 0.0, 'tint_shadow': tints['shadow'], 'tint_mid': tints['mid'], 'tint_high': tints['high']}
    look = Look(p)
    for old in os.listdir(LUT_DIR) if os.path.isdir(LUT_DIR) else []:
        if old.endswith('.cube') and old != os.path.basename(LUT_PATH):
            os.remove(os.path.join(LUT_DIR, old))
    err = write_cube(look, LUT_PATH)
    # emitters: the reference lamp colour is out of AgX's reach for any scene colour, so it cannot live in the grade
    emit = []
    for tid, tgt in emitter_targets():
        r = least_squares(lambda x: display(np.exp(x)) - tgt, np.log([1, 0.4, 0.1]), bounds=(-20, 5))
        best = display(np.exp(r.x))
        emit.append({'id': tid, 'target_hex': '#%02x%02x%02x' % tuple(np.round(tgt * 255).astype(int)),
                     'closest_agx_hex': '#%02x%02x%02x' % tuple(np.round(best * 255).astype(int)),
                     'closest_dE76': round(float(de76(best, tgt)), 1), 'scene_rgb': [round(float(v), 4) for v in np.exp(r.x)]})
    greys = np.linspace(0, 1, 11)[:, None].repeat(3, 1)
    grey_shift = to_lab(eotf(look(greys))) - to_lab(eotf(greys))
    rig = rigs()
    stats = grade_stats(look, rig['anchors']['day_exterior_sunlit']['E'])
    grade = {'params': p, 'components': ['neutral bias only (the light-source saturation boost of v1 is removed)'],
             'emitters_unreachable_by_agx': emit, 'lut': os.path.relpath(LUT_PATH, ROOT), 'lut_size': LUT_SIZE,
             'max_abs_change_codes': round(err * 255, 2), 'stats': stats,
             'grey_ramp_dLab': [[round(float(v), 2) for v in r] for r in grey_shift],
             'agx': {'scene_grey_0.18_display_srgb': round(float(display(np.array([0.18] * 3))[0]), 4),
                     'scene_for_display_0.5': round(agx_inverse_grey(0.5), 4),
                     'scene_for_display_0.98': round(agx_inverse_grey(0.98), 2)}}
    json.dump(grade, open(os.path.join(OUT, 'grade.json'), 'w'), indent=1)
    json.dump(rig, open(os.path.join(OUT, 'rigs.json'), 'w'), indent=1)
    alb = albedo(rig)
    json.dump(alb, open(os.path.join(OUT, 'albedo.json'), 'w'), indent=1)
    rig['rigs']['movables'] = movables(rig['anchors'], alb)
    json.dump(rig, open(os.path.join(OUT, 'rigs.json'), 'w'), indent=1)
    chart(look, os.path.join(BOARD, 'grade_chart.png'))
    print(json.dumps({k: v for k, v in grade.items() if k not in ('grey_ramp_dLab', 'params')}, indent=1))
    for k, v in rig['anchors'].items():
        print(k, v['E'], v['card_code'], v['anchor_kind'])
    print(json.dumps(rig['rigs'], indent=1)[:6000])
    for f, v in alb['families'].items():
        print('albedo', f, v)
    print('checker', alb['checker_t033'])


if __name__ == '__main__':
    main()
