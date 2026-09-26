"""Camera recovery from the look references (WP-P0-04).

For each reference view: detect line segments (OpenCV LSD), find the vanishing point (VP) of the world verticals and
of the two floor axes by RANSAC, then fit one pinhole camera to all inlier segments (zero roll, principal point at the
frame centre, both checked below):

    nadir VP   = (cx, cy + f / tan(pitch))
    axis VPs   = (cx + f / (tan(yaw) cos(pitch)), cy - f tan(pitch)) and (cx - f tan(yaw) / cos(pitch), cy - f tan(pitch))
    f^2        = -(v_i - c) . (v_j - c) for every pair of orthogonal VPs (three independent estimates per view)

Trailer frames hold the 1920x1080 game frame scaled by 1740/1920 at (90, 9) inside the paper frame; segments are
mapped back to game pixels first. Outputs tools/targets/out/camera.json and docs/art/camera/vp_<id>.jpg overlays.

    tools/targets/.venv/bin/python tools/targets/camera.py
"""

import json
import math
import os

import cv2
import numpy as np
from scipy.optimize import least_squares

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'targets', 'source')
OUT_JSON = os.path.join(ROOT, 'tools', 'targets', 'out', 'camera.json')
OUT_IMG = os.path.join(ROOT, 'docs', 'art', 'camera')

GAME_W, GAME_H = 1920, 1080
C = np.array([GAME_W / 2, GAME_H / 2])
TRAILER_SCALE = 1740 / 1920
TRAILER_OFFSET = np.array([90.0, 9.0])

# HUD blocks in game pixels.
RIGHT = (1640, 0, 1920, 1080)
TOPRIGHT = (1430, 0, 1920, 215)
BOTTOMLEFT = (0, 820, 760, 1080)
BOTTOM = (600, 900, 1400, 1080)
CAPTIONS = (0, 950, 1920, 1080)
HUD = [RIGHT, TOPRIGHT, BOTTOMLEFT, BOTTOM]


def topleft(w, h):
    return (0, 0, w, h)


# (id, file, masks, description, kind, min segment length in game px)
# kind 'native': the game HUD is on screen, so the frame is an unedited game camera.
# kind 'punch-in': HUD-less trailer shot; the editor cropped/rotated the frame (roll 2-6 deg, pitch 37-39 deg), so it
# only bounds how close the camera can get and is excluded from the standard.
# ss_05 (night rain) is left out: rain streaks form a false vertical family at any segment length.
VIEWS = [
    ('ss_01', 'screenshots/ss_01_8f2609d8.jpg', HUD + [(350, 110, 1570, 960), (0, 0, 1920, 80)], 'Supermarket before the disaster, shop UI (screenshot)', 'native', 50),
    ('ss_02', 'screenshots/ss_02_dede236e.jpg', HUD + [topleft(430, 250)], 'Duplex 2F terrace, Day 7 11:50 (screenshot)', 'native', 50),
    ('ss_04', 'screenshots/ss_04_344f0472.jpg', HUD, 'Home 1F storeroom, Day 1 17:20 (screenshot)', 'native', 50),
    ('ss_06', 'screenshots/ss_06_bdcdf4bc.jpg', HUD + [topleft(560, 340)], 'Rooftops and street, Day 2 07:50 (screenshot)', 'native', 50),
    ('ss_07', 'screenshots/ss_07_02c2b148.jpg', HUD + [(250, 210, 1650, 870), topleft(620, 280)], 'Inventory UI over the scene, Day 5 09:50 (screenshot)', 'native', 50),
    ('t019', 'trailer/shot_09_t018.983s.jpg', HUD + [CAPTIONS, topleft(480, 200)], 'Supermarket, pre-disaster', 'native', 50),
    ('t025', 'trailer/shot_15_t024.933s.jpg', [CAPTIONS], 'Home storeroom and bed, lamps on', 'punch-in', 50),
    ('t026', 'trailer/shot_16_t026.217s.jpg', [CAPTIONS], 'Garage storeroom', 'punch-in', 50),
    ('t028', 'trailer/shot_19_t028.000s.jpg', [CAPTIONS], 'Storeroom, closest zoom', 'punch-in', 50),
    ('t032', 'trailer/shot_22_t032.300s.jpg', HUD + [CAPTIONS], 'Roof, Day 3', 'native', 50),
    ('t033', 'trailer/shot_23_t033.500s.jpg', HUD + [CAPTIONS, (1200, 250, 1920, 760)], 'Home 1F at night, Day 18', 'native', 50),
    ('t035', 'trailer/shot_24_t035.212s.jpg', HUD + [CAPTIONS, (700, 0, 1250, 140)], 'Apartment 1F, whole floor, golden light', 'native', 50),
    ('t041', 'trailer/shot_27_t041.417s.jpg', HUD + [CAPTIONS, topleft(560, 200)], 'Apartment front in snow, Day 16 15:20', 'native', 50),
    ('t049', 'trailer/shot_31_t049.038s.jpg', [CAPTIONS], 'Front yard horde with traps, low sun', 'punch-in', 50),
    ('t059', 'trailer/shot_35_t059.417s.jpg', HUD + [CAPTIONS, topleft(560, 250)], 'Roof, Day 1 14:40', 'native', 50),
    ('t067', 'trailer/shot_40_t067.171s.jpg', [CAPTIONS], 'Storeroom, bright', 'punch-in', 50),
    ('t069', 'trailer/shot_41_t068.883s.jpg', HUD + [CAPTIONS, topleft(480, 120)], 'Home storeroom, Day 1 11:50', 'native', 50),
    ('t074', 'trailer/shot_44_t073.800s.jpg', HUD + [CAPTIONS, topleft(480, 120)], 'Home storeroom and bedroom, Day 1 12:10', 'native', 50),
    ('t080', 'trailer/shot_47_t079.713s.jpg', [CAPTIONS], 'Office with sofa, closest zoom (sofa edges pollute the verticals)', 'punch-in', 50),
]


def load_segments(path, trailer, masks, min_len=50):
    img = cv2.imread(path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    lsd = cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    raw = np.asarray(lsd.detect(gray)[0]).reshape(-1, 4).astype(np.float64)
    seg = raw.copy()
    if trailer:
        seg[:, [0, 2]] = (seg[:, [0, 2]] - TRAILER_OFFSET[0]) / TRAILER_SCALE
        seg[:, [1, 3]] = (seg[:, [1, 3]] - TRAILER_OFFSET[1]) / TRAILER_SCALE
    length = np.hypot(seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1])
    mid = (seg[:, 0:2] + seg[:, 2:4]) / 2
    keep = length >= min_len
    keep &= (seg[:, [0, 2]].min(1) >= 12) & (seg[:, [0, 2]].max(1) <= GAME_W - 12)
    keep &= (seg[:, [1, 3]].min(1) >= 8) & (seg[:, [1, 3]].max(1) <= GAME_H - 8)
    for m in masks:
        keep &= ~((mid[:, 0] >= m[0]) & (mid[:, 0] <= m[2]) & (mid[:, 1] >= m[1]) & (mid[:, 1] <= m[3]))
    return img, raw[keep], seg[keep]


def hom_lines(seg):
    p1 = np.c_[seg[:, 0:2], np.ones(len(seg))]
    p2 = np.c_[seg[:, 2:4], np.ones(len(seg))]
    l = np.cross(p1, p2)
    return l / np.linalg.norm(l[:, :2], axis=1, keepdims=True)


def angle_err(seg, v):
    """Angle (deg) between each segment and the line from its midpoint to the VP v (homogeneous)."""
    mid = (seg[:, 0:2] + seg[:, 2:4]) / 2
    d = seg[:, 2:4] - seg[:, 0:2]
    t = np.tile(v[:2], (len(seg), 1)) if abs(v[2]) < 1e-12 else v[:2] / v[2] - mid
    cos = np.abs((d * t).sum(1)) / (np.linalg.norm(d, axis=1) * np.linalg.norm(t, axis=1) + 1e-12)
    return np.degrees(np.arccos(np.clip(cos, 0, 1)))


def refine(seg):
    w = np.hypot(seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1])
    _, _, vt = np.linalg.svd(hom_lines(seg) * w[:, None])
    return vt[-1]


def vp_ok(v, where):
    """Nadir must lie below the frame, floor-axis VPs above it (camera looks down)."""
    if abs(v[2]) < 1e-9 * np.linalg.norm(v[:2]):
        return where == 'above' and abs(v[1]) < 0.5 * abs(v[0]) or where == 'below' and abs(v[0]) < 0.3 * abs(v[1])
    y = v[1] / v[2] - C[1]
    return y > GAME_H / 2 if where == 'below' else y < -GAME_H / 3


def ransac(seg, thr, where, rng, iters=4000):
    n = len(seg)
    if n < 4:
        return None, np.zeros(n, bool)
    lines = hom_lines(seg)
    w = np.hypot(seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1])
    p = w / w.sum()
    best, score = None, -1.0
    for _ in range(iters):
        i, j = rng.choice(n, 2, replace=False, p=p)
        v = np.cross(lines[i], lines[j])
        if np.linalg.norm(v) < 1e-12 or not vp_ok(v, where):
            continue
        inl = angle_err(seg, v) < thr
        s = w[inl].sum()
        if s > score:
            best, score = inl, s
    if best is None or best.sum() < 4:
        return None, np.zeros(n, bool)
    v = refine(seg[best])
    for _ in range(3):
        best = angle_err(seg, v) < thr
        v = refine(seg[best])
    return v, best


def model_vps(f, pitch, yaw):
    """Homogeneous VPs (nadir, axis X, axis Z) for zero roll and principal point C."""
    sp, cp = math.sin(pitch), math.cos(pitch)
    sy, cy = math.sin(yaw), math.cos(yaw)
    # direction -> image: x = f (D.R)/(D.F), y = -f (D.U)/(D.F); homogeneous (f D.R + cx D.F, -f D.U + cy D.F, D.F)
    F = np.array([sy * cp, -sp, cy * cp])
    R = np.array([cy, 0.0, -sy])
    U = np.array([sp * sy, cp, sp * cy])
    out = []
    for D in (np.array([0.0, -1.0, 0.0]), np.array([1.0, 0.0, 0.0]), np.array([0.0, 0.0, 1.0])):
        dF, dR, dU = D @ F, D @ R, D @ U
        out.append(np.array([f * dR + C[0] * dF, -f * dU + C[1] * dF, dF]))
    return out


def fit(families, x0):
    """Least-squares (f, pitch, yaw) over all inlier segments, weighted by sqrt(length)."""
    def resid(p):
        vps = model_vps(p[0], p[1], p[2])
        r = []
        for seg, k in families:
            w = np.sqrt(np.hypot(seg[:, 2] - seg[:, 0], seg[:, 3] - seg[:, 1]) / 100)
            r.append(angle_err(seg, vps[k]) * w)
        return np.concatenate(r)

    res = least_squares(resid, x0, bounds=([200, math.radians(10), math.radians(-89)], [20000, math.radians(89), math.radians(89)]))
    return res.x, float(np.sqrt(np.mean(res.fun ** 2)))


def pairwise_f(vs):
    rel = [None if abs(v[2]) < 1e-12 else v[:2] / v[2] - C for v in vs]
    out = []
    for i, j in ((0, 1), (0, 2), (1, 2)):
        if rel[i] is not None and rel[j] is not None:
            q = -(rel[i] @ rel[j])
            out.append(math.sqrt(q) if q > 0 else float('nan'))
    return out


def analyse(vid, rel, masks, what, kind, min_len, rng):
    trailer = rel.startswith('trailer/')
    img, raw, seg = load_segments(os.path.join(SRC, rel), trailer, masks, min_len)
    ang = np.degrees(np.arctan2(seg[:, 3] - seg[:, 1], seg[:, 2] - seg[:, 0])) % 180
    vc = np.abs(ang - 90) < 30
    v_n, in_n = ransac(seg[vc], 1.0, 'below', rng)
    rest = np.where(~vc)[0]
    v_a, in_a = ransac(seg[rest], 0.8, 'above', rng)
    rest2 = rest[~in_a]
    v_b, in_b = ransac(seg[rest2], 0.8, 'above', rng)
    if v_n is None or v_a is None or v_b is None:
        return None
    fams = [seg[vc][in_n], seg[rest][in_a], seg[rest2][in_b]]
    fpair = pairwise_f([v_n, v_a, v_b])
    # which horizontal family is the steep one (VP nearer the frame centre) -> axis Z (small yaw), the other X
    def dist(v):
        return np.linalg.norm(v[:2] / v[2] - C) if abs(v[2]) > 1e-12 else 1e12
    steep, shallow = (1, 2) if dist(v_a) < dist(v_b) else (2, 1)
    families = [(fams[0], 0), (fams[shallow], 1), (fams[steep], 2)]
    f0 = np.nanmedian(fpair) if np.isfinite(np.nanmedian(fpair)) else 1500.0
    nad = v_n[:2] / v_n[2] - C if abs(v_n[2]) > 1e-12 else np.array([0, 1e9])
    p0 = math.atan2(f0, max(1.0, np.hypot(*nad)))
    vz = [v_a, v_b][steep - 1]
    yz = abs(math.atan(abs(vz[0] / vz[2] - C[0]) * math.cos(p0) / f0)) if abs(vz[2]) > 1e-12 else math.radians(30)
    side = 'right' if abs(vz[2]) > 1e-12 and (vz[0] / vz[2] - C[0]) > 0 else 'left'
    # yaw < 0 puts the steep axis VP right of centre (model_vps convention)
    y0 = -max(math.radians(2), yz) if side == 'right' else max(math.radians(2), yz)
    (f, pitch, yaw), rms = fit(families, [f0, p0, y0])

    boot = []
    for _ in range(120):
        bf = [(s[rng.integers(0, len(s), len(s))], k) for s, k in families]
        (bf_f, bf_p, bf_y), _ = fit(bf, [f, pitch, yaw])
        boot.append((math.degrees(2 * math.atan(GAME_H / 2 / bf_f)), math.degrees(bf_p), math.degrees(bf_y)))
    boot = np.array(boot)
    roll = math.degrees(math.atan2(nad[0], nad[1]))
    r = {
        'id': vid, 'file': rel, 'what': what, 'kind': kind, 'min_segment_px': min_len,
        'f_px': round(f, 1),
        'vfov_deg': round(math.degrees(2 * math.atan(GAME_H / 2 / f)), 2),
        'hfov_deg': round(math.degrees(2 * math.atan(GAME_W / 2 / f)), 2),
        'pitch_deg': round(math.degrees(pitch), 2),
        'yaw_deg': round(math.degrees(yaw), 2),
        'steep_axis_vp_side': side,
        'roll_from_nadir_deg': round(roll, 2),
        'rms_angle_err_deg': round(rms, 3),
        'f_pairs_px': [round(x, 0) for x in fpair],
        'f_pair_spread_pct': round(100 * (np.nanmax(fpair) - np.nanmin(fpair)) / np.nanmedian(fpair), 1),
        'ci68': {k: np.percentile(boot[:, i], [16, 84]).round(2).tolist() for i, k in enumerate(('vfov_deg', 'pitch_deg', 'yaw_deg'))},
        'inliers': [int(len(s)) for s, _ in families],
    }

    vis = (img.astype(np.float32) * 0.55).astype(np.uint8)
    cols = [(0, 230, 255), (80, 220, 80), (40, 150, 255)]  # BGR: yellow, green, orange
    fam_raw = [raw[vc][in_n], raw[rest][in_a], raw[rest2][in_b]]
    order = [0, shallow, steep]
    for k, fi in enumerate(order):
        for s in fam_raw[fi]:
            cv2.line(vis, (int(s[0]), int(s[1])), (int(s[2]), int(s[3])), cols[k], 3, cv2.LINE_AA)
    txt = [f"{vid} [{kind}]: {what}",
           f"vFOV {r['vfov_deg']:.1f} deg  pitch {r['pitch_deg']:.1f} deg  yaw {r['yaw_deg']:.1f} deg  rms {rms:.2f} deg",
           "yellow: verticals  green: shallow floor axis  orange: steep floor axis"]
    if kind != 'native':
        txt.append('trailer punch-in: excluded from the camera standard')
    for i, t in enumerate(txt):
        cv2.putText(vis, t, (24, 44 + 38 * i), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 5, cv2.LINE_AA)
        cv2.putText(vis, t, (24, 44 + 38 * i), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2, cv2.LINE_AA)
    vis = cv2.resize(vis, (1280, 720), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(OUT_IMG, f'vp_{vid}.jpg'), vis, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return r


def main():
    os.makedirs(OUT_IMG, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    rng = np.random.default_rng(4164790)
    results = []
    for vid, rel, masks, what, kind, min_len in VIEWS:
        r = analyse(vid, rel, masks, what, kind, min_len, rng)
        if r is None:
            print(f'{vid:6s} no solution')
            continue
        results.append(r)
        print(f"{vid:6s} {kind:8s} vfov {r['vfov_deg']:5.1f} [{r['ci68']['vfov_deg'][0]:5.1f},{r['ci68']['vfov_deg'][1]:5.1f}]  "
              f"pitch {r['pitch_deg']:5.1f} [{r['ci68']['pitch_deg'][0]:5.1f},{r['ci68']['pitch_deg'][1]:5.1f}]  "
              f"yaw {r['yaw_deg']:5.1f} ({r['steep_axis_vp_side']})  roll {r['roll_from_nadir_deg']:6.1f}  "
              f"rms {r['rms_angle_err_deg']:.2f}  f_pairs {r['f_pairs_px']}  n {r['inliers']}")
    native = [r for r in results if r['kind'] == 'native' and r['rms_angle_err_deg'] < 1.0]
    wide = [r for r in native if r['vfov_deg'] >= 56]
    summary = {
        'native_views': [r['id'] for r in native],
        'pitch_deg_median': round(float(np.median([r['pitch_deg'] for r in native])), 2),
        'pitch_deg_range': [min(r['pitch_deg'] for r in native), max(r['pitch_deg'] for r in native)],
        'yaw_deg_median': round(float(np.median([r['yaw_deg'] for r in native])), 2),
        'default_vfov_deg_median': round(float(np.median([r['vfov_deg'] for r in wide])), 2),
        'default_views': [r['id'] for r in wide],
        'zoomed_native_vfov_deg': sorted(r['vfov_deg'] for r in native if r['vfov_deg'] < 56),
        'punch_in_vfov_deg': sorted(r['vfov_deg'] for r in results if r['kind'] != 'native'),
    }
    print(json.dumps(summary))
    with open(OUT_JSON, 'w') as fh:
        json.dump({'summary': summary, 'views': results}, fh, indent=1)


if __name__ == '__main__':
    main()
