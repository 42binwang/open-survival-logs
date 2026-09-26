"""Scale, heights and framing from the recovered camera (WP-P0-04).

Uses the per-view camera fits in tools/targets/out/camera.json (f, pitch; zero roll, centred principal point).

1. Camera height H from characters of assumed height (male 1.75 m, female 1.65 m): for a vertical segment with its
   foot on the floor, k = 1 - (rb * dt_y) / (db_y * rt) where d are the view rays of foot and head and r their
   horizontal lengths; H = h / k. The look-at distance is D = H / sin(pitch).
2. Heights of walls, doors and props from hand-picked vertical segments (file pixels, listed in PICKS) with the mean H.
   A segment whose foot is not on the floor gives its foot height (foot_h), e.g. the cut-wall cap.
3. Framing per vertical FOV at 1920x1080: floor footprint of the frame, px per metre at the bottom, centre and top
   rows, on-screen character height, and the share of each home's floor (src/content/homes.js sizes) in view when the
   camera looks at the floor centre.

Outputs tools/targets/out/scale.json, docs/art/scale/scale_<view>.jpg (picks drawn on the frames) and
docs/art/camera/framing.png (top-down footprints over the 14 x 11 m apartment floor).

    tools/targets/.venv/bin/python tools/targets/scale.py
"""

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'targets', 'source')
CAM_JSON = os.path.join(ROOT, 'tools', 'targets', 'out', 'camera.json')
OUT_JSON = os.path.join(ROOT, 'tools', 'targets', 'out', 'scale.json')
OUT_SCALE = os.path.join(ROOT, 'docs', 'art', 'scale')
OUT_FRAMING = os.path.join(ROOT, 'docs', 'art', 'camera', 'framing.png')

W, H_PX = 1920, 1080
TRAILER_SCALE = 1740 / 1920
TRAILER_OFFSET = (90.0, 9.0)
PITCH = 40.0
YAW = 30.0

# Characters (foot, head) in file px, known height (m).
CHARACTERS = [
    ('ss_02', (858, 629), (858, 469), 1.65, 'student (female), standing'),
    ('t069', (713, 669), (668, 510), 1.75, 'wage slave (male), walking'),
    ('t035', (898, 563), (880, 441), 1.75, 'male, standing'),
    ('t025', (903, 917), (900, 702), 1.75, 'male, standing (trailer punch-in)'),
]

# Vertical segments (foot, top) in file px; foot_h is the height of the foot point (0 = floor).
PICKS = [
    ('t035', (930, 797), (930, 737), 0.0, 'cut wall, camera-facing (floor to cap)'),
    ('t035', (945, 802), (940, 588), 0.0, 'entrance door jamb incl. frame (upper bound)'),
    ('t035', (1172, 268), (1182, 175), 0.0, 'fridge (French door)'),
    ('t035', (1492, 262), (1560, 97), 'cut', 'full wall, NE exterior corner (cut-wall cap to wall top)'),
    ('t041', (762, 558), (735, 375), 0.0, 'security door, left jamb'),
    ('t041', (895, 610), (887, 395), 0.0, 'security door, right jamb'),
    ('t069', (585, 488), (508, 163), 0.0, 'full wall, storeroom west wall at the extinguisher (floor to top)'),
    ('t074', (1043, 398), (1053, 108), 0.0, 'wall, bedroom inner corner (foot where the floor meets the wall below the wainscot)'),
    ('ss_04', (733, 890), (687, 706), 0.0, 'steel shelving rack, front post (LSD segment)'),
]

# Horizontal floor spans: (view, point a, point b, label); both points on the floor plane.
SPANS = [
    ('t041', (762, 558), (895, 610), 'security door opening incl. frame, jamb foot to jamb foot'),
]
SURFACE_HEIGHTS = [0.0, 0.9, 1.0, 1.4, 2.0, 2.4, 3.3]

HOMES = {'apartment': (14, 11), 'duplex': (13, 10), 'warehouse': (18, 13)}
APARTMENT_ROOMS = [('kitchen', 1, 1, 4, 4), ('bath', 6, 1, 3, 4), ('bed', 10, 1, 3, 4), ('living', 1, 5, 12, 5)]
FOVS = [60, 55, 50, 45, 40, 35, 30]
HUD = [(1640, 0, 1920, 1080), (1430, 0, 1920, 215), (0, 820, 760, 1080), (600, 900, 1400, 1080)]


def game(p, trailer):
    return ((p[0] - TRAILER_OFFSET[0]) / TRAILER_SCALE, (p[1] - TRAILER_OFFSET[1]) / TRAILER_SCALE) if trailer else p


def ray(p, f, pitch_deg):
    """View ray in a yaw-free frame: x right, y up, z forward-horizontal."""
    pr = math.radians(pitch_deg)
    x = (p[0] - W / 2) / f
    y = -(p[1] - H_PX / 2) / f
    return (x, y * math.cos(pr) - math.sin(pr), y * math.sin(pr) + math.cos(pr))


def top_height(foot, top, foot_h, cam_h, f, pitch_deg):
    db, dt = ray(foot, f, pitch_deg), ray(top, f, pitch_deg)
    rb, rt = math.hypot(db[0], db[2]), math.hypot(dt[0], dt[2])
    r = (foot_h - cam_h) * rb / db[1]
    return cam_h + dt[1] * r / rt


def off_vertical(foot, top, f, pitch_deg):
    """Angle (deg) between a picked segment and the true vertical through its foot (the line to the nadir)."""
    nad = (W / 2, H_PX / 2 + f / math.tan(math.radians(pitch_deg)))
    a = math.atan2(top[0] - foot[0], top[1] - foot[1])
    b = math.atan2(foot[0] - nad[0], foot[1] - nad[1])
    d = math.degrees(a - b) % 180
    return min(d, 180 - d)


def floor_point(p, f, pitch_deg, cam_h):
    """Ground-plane point (x right, z forward) under pixel p, camera at height cam_h."""
    r = ray(p, f, pitch_deg)
    t = cam_h / -r[1]
    return np.array([r[0] * t, r[2] * t])


def camera_height(foot, top, h, f, pitch_deg):
    db, dt = ray(foot, f, pitch_deg), ray(top, f, pitch_deg)
    rb, rt = math.hypot(db[0], db[2]), math.hypot(dt[0], dt[2])
    return h / (1 - (rb * dt[1]) / (db[1] * rt))


class Camera:
    """Standard camera: looks at `target` on the floor plane with pitch PITCH, bearing N YAW deg W, distance d."""

    def __init__(self, vfov, d, target=(0.0, 0.0)):
        self.f = (H_PX / 2) / math.tan(math.radians(vfov) / 2)
        p, y = math.radians(PITCH), math.radians(YAW)
        # world: x east, y up, z south (three.js); sim grid x -> x, sim grid y -> z
        self.F = np.array([-math.sin(y) * math.cos(p), -math.sin(p), -math.cos(y) * math.cos(p)])
        self.R = np.cross(self.F, [0.0, 1.0, 0.0])
        self.R /= np.linalg.norm(self.R)
        self.U = np.cross(self.R, self.F)
        self.T = np.array([target[0], 0.0, target[1]])
        self.C = self.T - d * self.F

    def project(self, pts):
        d = np.atleast_2d(pts) - self.C
        z = d @ self.F
        return np.c_[W / 2 + self.f * (d @ self.R) / z, H_PX / 2 - self.f * (d @ self.U) / z], z

    def floor_hit(self, u, v, h=0.0):
        x, y = (u - W / 2) / self.f, -(v - H_PX / 2) / self.f
        d = self.F + x * self.R + y * self.U
        if d[1] >= 0:
            return None
        return self.C + d * ((h - self.C[1]) / d[1])


def in_frame(uv, masks=()):
    ok = (uv[:, 0] >= 0) & (uv[:, 0] < W) & (uv[:, 1] >= 0) & (uv[:, 1] < H_PX)
    for m in masks:
        ok &= ~((uv[:, 0] >= m[0]) & (uv[:, 0] < m[2]) & (uv[:, 1] >= m[1]) & (uv[:, 1] < m[3]))
    return ok


def framing(vfov, d, cam_h):
    cam = Camera(vfov, d)
    row = {'vfov_deg': vfov, 'hfov_deg': round(math.degrees(2 * math.atan(W / 2 / cam.f)), 1), 'f_px': round(cam.f, 1)}
    near = cam_h / math.tan(math.radians(PITCH + vfov / 2))
    far = cam_h / math.tan(math.radians(PITCH - vfov / 2)) if PITCH > vfov / 2 else float('inf')
    row['floor_near_m'] = round(near, 2)
    row['floor_far_m'] = round(far, 1)
    row['target_ground_dist_m'] = round(cam_h / math.tan(math.radians(PITCH)), 2)
    widths = {}
    density = {}
    for name, v in (('bottom', H_PX - 1), ('centre', H_PX / 2), ('top', 0)):
        a, b = cam.floor_hit(0, v), cam.floor_hit(W, v)
        if a is None or b is None:
            continue
        widths[name] = round(float(np.linalg.norm(a - b)), 1)
        depth = float((a - cam.C) @ cam.F)
        density[name] = round(cam.f / depth, 1)
    row['floor_width_m'] = widths
    row['floor_px_per_m'] = density
    # the densest place for a surface of height h is where the bottom-row ray meets the plane y = h
    row['bottom_row_px_per_m_by_height'] = {}
    for h in SURFACE_HEIGHTS:
        hit = cam.floor_hit(W / 2, H_PX - 1, h)
        row['bottom_row_px_per_m_by_height'][f'{h:.1f}'] = round(cam.f / float((hit - cam.C) @ cam.F), 1)
    row['px_per_m_1m_high_bottom'] = row['bottom_row_px_per_m_by_height']['1.0']
    # tallest surface still inside 256 px/m +10 % at the bottom row (1 cm steps)
    top_ok = 0.0
    for h in np.arange(0, 3.31, 0.01):
        hit = cam.floor_hit(W / 2, H_PX - 1, float(h))
        if cam.f / float((hit - cam.C) @ cam.F) <= 256 * 1.10:
            top_ok = float(h)
        else:
            break
    row['max_height_within_256_tol_m'] = round(top_ok, 2)
    top1 = 0.0
    for h in np.arange(0, 3.31, 0.01):
        hit = cam.floor_hit(W / 2, H_PX - 1, float(h))
        if cam.f / float((hit - cam.C) @ cam.F) <= 256:
            top1 = float(h)
        else:
            break
    row['max_height_at_or_below_256_m'] = round(top1, 2)
    # floor incidence (angle between view ray and the floor) at the top and bottom rows
    row['floor_incidence_deg'] = [round(PITCH - vfov / 2, 1), round(PITCH + vfov / 2, 1)]
    uv, _ = cam.project(np.array([[0.0, 0.0, 0.0], [0.0, 1.75, 0.0]]))
    row['character_175_px'] = round(float(abs(uv[0, 1] - uv[1, 1])), 1)
    homes = {}
    for home, (hw, hh) in HOMES.items():
        c = Camera(vfov, d, (hw / 2, hh / 2))
        gx, gz = np.meshgrid(np.arange(0.05, hw, 0.1), np.arange(0.05, hh, 0.1))
        pts = np.c_[gx.ravel(), np.zeros(gx.size), gz.ravel()]
        uv, _ = c.project(pts)
        homes[home] = {'in_frame_pct': round(100 * float(in_frame(uv).mean()), 1),
                       'hud_free_pct': round(100 * float(in_frame(uv, HUD).mean()), 1)}
    row['floor_in_view'] = homes
    return row


def draw_board(vid, cam, rows, img_path, trailer, out):
    im = Image.open(img_path).convert('RGB')
    dr = ImageDraw.Draw(im)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20)
    for kind, foot, top, label, val in rows:
        col = (255, 220, 0) if kind == 'character' else (0, 230, 255)
        dr.line([foot, top], fill=col, width=4)
        for p in (foot, top):
            dr.ellipse([p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6], outline=col, width=3)
        txt = f'{label}: {val}'
        x, y = top[0] + 12, top[1] - 12
        tw = dr.textlength(txt, font=font)
        if x + tw > im.width - 10:
            x = top[0] - 12 - tw
        dr.text((x + 2, y + 2), txt, fill=(0, 0, 0), font=font)
        dr.text((x, y), txt, fill=col, font=font)
    head = f"{vid}: vFOV {cam['vfov_deg']:.1f} deg, pitch {cam['pitch_deg']:.1f} deg; heights from camera fit + H"
    dr.rectangle([0, 0, im.width, 34], fill=(0, 0, 0))
    dr.text((10, 6), head, fill=(255, 255, 255), font=small)
    im.save(out, quality=88)


def draw_framing(d, out):
    s = 20  # px per metre
    x0, x1, z0, z1 = -16.0, 26.0, -18.0, 18.0
    hw, hh = HOMES['apartment']
    iw, ih = int((x1 - x0) * s), int((z1 - z0) * s) + 130
    im = Image.new('RGB', (iw, ih), (24, 24, 26))
    dr = ImageDraw.Draw(im)
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 16)
    bold = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)

    def P(x, z):
        return ((x - x0) * s, (z - z0) * s)

    dr.rectangle([P(0, 11), P(14, 15)], fill=(44, 58, 40))
    dr.rectangle([P(0, 0), P(hw, hh)], fill=(70, 62, 52), outline=(200, 190, 170), width=2)
    for name, x, z, w, h in APARTMENT_ROOMS:
        dr.rectangle([P(x, z), P(x + w, z + h)], outline=(150, 140, 125), width=1)
        dr.text(P(x + 0.2, z + 0.2), name, fill=(200, 190, 170), font=font)
    for gx in range(hw + 1):
        dr.line([P(gx, 0), P(gx, hh)], fill=(90, 82, 72))
    for gz in range(hh + 1):
        dr.line([P(0, gz), P(hw, gz)], fill=(90, 82, 72))
    cols = {60: (255, 200, 60), 50: (90, 220, 120), 40: (80, 170, 255)}
    for vfov, col in cols.items():
        cam = Camera(vfov, d, (hw / 2, hh / 2))
        poly = []
        for u, v in [(0, H_PX - 1)] + [(x, 0) for x in np.linspace(0, W, 5)] + [(W, H_PX - 1)]:
            p = cam.floor_hit(u, v)
            poly.append(P(p[0], p[2]))
        dr.line(poly + [poly[0]], fill=col, width=3)
        dr.text((poly[0][0] - 70, poly[0][1] + 4), f'{vfov} deg', fill=col, font=bold)
    cam = Camera(60, d, (hw / 2, hh / 2))
    c, t = P(cam.C[0], cam.C[2]), P(hw / 2, hh / 2)
    dr.line([c, t], fill=(255, 255, 255), width=2)
    dr.ellipse([c[0] - 7, c[1] - 7, c[0] + 7, c[1] + 7], fill=(255, 255, 255))
    dr.text((c[0] + 10, c[1] - 8), 'camera (ground point)', fill=(255, 255, 255), font=font)
    dr.text(P(-15.5, -17.5), 'N', fill=(255, 255, 255), font=bold)
    dr.rectangle([0, ih - 130, iw, ih], fill=(12, 12, 14))
    notes = ['Top-down plan, north up, 1 grid = 1 m: apartment 1F 14 x 11 m from homes.js, yard in green.',
             f'Camera ground point (white) sits {cam_ground(d):.2f} m S{YAW:.0f}E of the look-at point (floor centre); '
             f'height {d * math.sin(math.radians(PITCH)):.2f} m,',
             f'distance {d:.2f} m, pitch {PITCH:.0f} deg, looks N{YAW:.0f}W. Outlines: floor visible in a 1920x1080 frame at',
             'vFOV 60 (default), 50 and 40 (zoom-in limit). Far edges run off the plot (38 m / 25 m / 18.5 m from the camera).']
    for i, n in enumerate(notes):
        dr.text((12, ih - 122 + 26 * i), n, fill=(230, 230, 230), font=font)
    im.save(out)


def cam_ground(d):
    return d * math.cos(math.radians(PITCH))


def main():
    cams = json.load(open(CAM_JSON))
    cams = {c['id']: c for c in (cams['views'] if isinstance(cams, dict) else cams)}
    os.makedirs(OUT_SCALE, exist_ok=True)
    res = {'assumptions': {'male_m': 1.75, 'female_m': 1.65}, 'characters': [], 'picks': [], 'framing': []}
    hs = []
    boards = {}
    for vid, foot, top, h, label in CHARACTERS:
        c = cams[vid]
        tr = c['file'].startswith('trailer/')
        H = camera_height(game(foot, tr), game(top, tr), h, c['f_px'], c['pitch_deg'])
        hs.append(H)
        res['characters'].append({'view': vid, 'label': label, 'height_m': h, 'vfov_deg': c['vfov_deg'],
                                  'camera_height_m': round(H, 2), 'look_distance_m': round(H / math.sin(math.radians(c['pitch_deg'])), 2)})
        boards.setdefault(vid, []).append(('character', foot, top, label, f'{h:.2f} m -> H {H:.2f} m'))
    cam_h = float(np.mean(hs))
    d = cam_h / math.sin(math.radians(PITCH))
    res['camera_height_m'] = round(cam_h, 2)
    res['camera_height_sd_m'] = round(float(np.std(hs, ddof=1)), 2)
    res['look_distance_m'] = round(d, 2)
    cut = None
    for vid, foot, top, foot_h, label in PICKS:
        c = cams[vid]
        tr = c['file'].startswith('trailer/')
        fh = cut if foot_h == 'cut' else foot_h
        h = top_height(game(foot, tr), game(top, tr), fh, cam_h, c['f_px'], c['pitch_deg'])
        if label.startswith('cut wall'):
            cut = h
        res['picks'].append({'view': vid, 'label': label, 'foot_h_m': round(fh, 2), 'height_m': round(h, 2),
                             'foot_px': foot, 'top_px': top,
                             'off_vertical_deg': round(off_vertical(game(foot, tr), game(top, tr), c['f_px'], c['pitch_deg']), 1)})
        boards.setdefault(vid, []).append(('pick', foot, top, label, f'{h:.2f} m'))
    res['spans'] = []
    for vid, a, b, label in SPANS:
        c = cams[vid]
        cam_ = Camera(c['vfov_deg'], d)
        tr = c['file'].startswith('trailer/')
        pa, pb = [floor_point(game(p, tr), c['f_px'], c['pitch_deg'], cam_h) for p in (a, b)]
        res['spans'].append({'view': vid, 'label': label, 'width_m': round(float(np.linalg.norm(pa - pb)), 2)})
        boards.setdefault(vid, []).append(('pick', a, b, label, f'{np.linalg.norm(pa - pb):.2f} m'))
    native = [r['camera_height_m'] for r in res['characters'] if 'punch-in' not in r['label']]
    res['camera_height_native_only_m'] = round(float(np.mean(native)), 2)
    res['look_distance_native_only_m'] = round(float(np.mean(native)) / math.sin(math.radians(PITCH)), 2)
    for vid, rows in boards.items():
        c = cams[vid]
        draw_board(vid, c, rows, os.path.join(SRC, c['file']), c['file'].startswith('trailer/'),
                   os.path.join(OUT_SCALE, f'scale_{vid}.jpg'))
    for vfov in FOVS:
        res['framing'].append(framing(vfov, d, cam_h))
    draw_framing(d, OUT_FRAMING)
    with open(OUT_JSON, 'w') as fh:
        json.dump(res, fh, indent=1)
    print(f'H = {cam_h:.2f} m (sd {res["camera_height_sd_m"]}), look distance D = {d:.2f} m')
    for p in res['picks']:
        print(f"  {p['view']:5s} {p['label']:58s} {p['height_m']:.2f} m (foot at {p['foot_h_m']:.2f} m)")
    for r in res['framing']:
        print(f"  vFOV {r['vfov_deg']:2d}  floor {r['floor_near_m']:5.2f}..{r['floor_far_m']:5.1f} m  width {r['floor_width_m']}  "
              f"px/m {r['floor_px_per_m']}  1m-high bottom {r['px_per_m_1m_high_bottom']}  char {r['character_175_px']} px  "
              f"homes {r['floor_in_view']}")


if __name__ == '__main__':
    main()
