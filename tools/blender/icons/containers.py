"""Parametric containers: tins and cans, jars, cups, bottles, boxes, bags (sacks and pillow packs) and packets.

Each builder takes its catalog block in millimetres and returns the list of objects it made (origin on the floor,
front towards -Y). Wrap labels use the `label` UV of `shapes.sweep`: u = 0.5 is the middle of the front.
"""

from __future__ import annotations

import math
import random

import bpy
import mathutils
import numpy as np

from materials import library as lib

from . import shading as sh
from . import shapes as sp

MM = 0.001


def _m(v):
    return v * MM


def lib_seed(seed: int) -> int:
    """A small variation seed for materials.library: Cycles overflows its texture index on the large seed offsets
    library.py builds from seeds above about 2^20 and renders black."""
    return 1 + seed % 997


# ------------------------------------------------------------------------------------------ tins and cans

def tin(t: dict, label_id: str, lid: str = "ring", seed: int = 1) -> list:
    """A drawn-steel tin: a rounded-rectangle (or round, w = d = 2r) body carrying a wrap label between double-seam
    beads, a countersunk lid with expansion beads and an easy-open score, and a pull ring (lid='ring') or none."""
    w, d, r, h = _m(t["w"]), _m(t["d"]), _m(t["r"]), _m(t["h"])
    b0, b1 = _m(t["band"][0]), _m(t["band"][1])
    out = sp.rounded_rect(w, d, r, 224)
    seam = 0.0011
    objs = []
    band = sp.sweep("TinBand", out, [(0.0, b0), (0.0, b1)], label_z=(b0, b1), label_u0=0.5, sharp_deg=None)
    sh.assign(band, sh.label("L_" + label_id, label_id))
    objs.append(band)
    lower = sp.sweep("TinSeamLow", out, [(-0.0032, 0.0014), (-0.0014, 0.0), (seam * 0.7, 0.0009), (seam, 0.0022),
                                        (seam, 0.0036), (seam * 0.4, b0 - 0.0006), (0.0, b0)], cap_bottom=True, sharp_deg=None)
    upper = sp.sweep("TinSeamTop", out, [(0.0, b1), (seam * 0.4, b1 + 0.0006), (seam, b1 + 0.0016), (seam, h - 0.0011),
                                        (seam * 0.35, h), (-0.0015, h - 0.0002), (-0.0024, h - 0.0012), (-0.0027, h - 0.0034)],
                     sharp_deg=None)
    lz = h - 0.0035
    lidm = sp.sweep("TinLid", out, [(-0.0027, h - 0.0034), (-0.0036, lz), (-0.0041, lz - 0.00025), (-0.0046, lz),
                                    (-0.0056, lz), (-0.0063, lz + 0.0005), (-0.0070, lz), (-0.0084, lz), (-0.0090, lz + 0.00045),
                                    (-0.0096, lz), (-0.0110, lz)], cap_top=True, sharp_deg=None)
    for ob in (lower, upper, lidm):
        lib.assign(ob, "metal_brushed", tint="aluminium", wear=0.05, dirt=0.0, seed=lib_seed(seed))
        objs.append(ob)
    if lid == "ring":
        objs += pull_ring(-w / 2 + 0.019, 0.0, lz, min(d * 0.36, 0.021), seed)
    return objs


def cup(c: dict, wrap_id: str, seed: int = 1) -> list:
    """A tapered paper cup with a rolled lip, printed wrap and pale inside, open and heaped with noodles, braised
    beef, bok choy, scallion and chili (the source's instant noodles are shown ready to eat)."""
    rb, rt, h = _m(c["bottom"]) / 2, _m(c["top"]) / 2, _m(c["h"])
    b0, b1 = _m(c["band"][0]), _m(c["band"][1])
    out = sp.circle(rb, 192)

    def off(z):
        return (rt - rb) * z / h

    lip = 0.0021
    objs = []
    base = sp.sweep("CupBase", out, [(off(0) - 0.0012, 0.0004), (off(0.0012), 0.0012), (off(b0), b0)], cap_bottom=True, sharp_deg=None)
    sh.assign(base, sh.plastic("CupBase", "#b8251b", 0.4, coat=0.2, sheen=1.0))
    band = sp.sweep("CupBand", out, [(off(b0), b0), (off(b1), b1)], label_z=(b0, b1), label_u0=0.5, sharp_deg=None)
    # sheen: a light rim at the silhouette keeps the red cup off a dark tile
    sh.assign(band, sh.label("L_" + wrap_id, wrap_id, sheen=1.0))
    zi = 0.004
    rim = sp.sweep("CupRim", out, [(off(b1), b1), (off(h - lip), h - lip), (off(h) + lip * 0.55, h - lip * 0.55), (off(h) + lip * 0.45, h),
                                  (off(h) - lip * 0.1, h + lip * 0.4), (off(h) - lip * 0.7, h), (off(h) - lip * 0.8, h - lip * 0.7),
                                  (off(h - 0.006) - 0.0011, h - 0.006), (off(zi) - 0.0011, zi)], cap_top=False, sharp_deg=None)
    rim_mat = sh.plastic("CupPaper", "#dcd6cc", 0.45, coat=0.1)
    sh.assign(rim, rim_mat)
    floor = sp.disc("CupFloor", sp.circle(rb + off(zi) - 0.0011, 96), zi)
    sh.assign(floor, rim_mat)
    objs += [base, band, rim, floor]
    # the source's "Beef Noodles": an open cup heaped with braised beef and greens (no lid)
    R = rb + off(h) - 0.0025
    top = h + 0.014

    def dome(r):
        return top - 0.016 * (r / R) ** 2
    prof = [(off(h - 0.03) - 0.0026, h - 0.03), (off(h) - 0.0025, h - 0.004)]
    for k in range(1, 9):
        r = R * (1 - k / 9)
        prof.append((r - rb, dome(r)))
    heap = sp.sweep("NoodleHeap", out, prof, cap_top=True, sharp_deg=None)
    sh.assign(heap, sh.noodle_block("Noodles", cooked=True))
    objs.append(heap)
    rnd = random.Random(seed)
    beef = sh.plastic("Beef", "#5c2411", 0.3, coat=0.7, sss=0.15, bump=0.4, bump_scale=300.0)
    for i in range(8):
        a = 2 * math.pi * i / 8 + rnd.uniform(-0.3, 0.3)
        d = R * (0.2 + 0.5 * ((i * 0.618) % 1.0))
        sz = rnd.uniform(0.011, 0.015)
        b = sp.box(f"Beef{i}", (sz, sz * rnd.uniform(0.7, 0.9), sz * 0.62), bevel=sz * 0.22, segments=2)
        b.location = (d * math.cos(a), d * math.sin(a), dome(d) - sz * 0.15)
        b.rotation_euler = (rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(0, math.pi))
        sh.assign(b, beef)
        objs.append(b)
    leaf = sh.plastic("BokChoy", "#2f6b22", 0.45, coat=0.2, sss=0.3)
    stem = sh.plastic("BokChoyStem", "#b6cf7e", 0.35, coat=0.4, sss=0.4)
    for i, (a, d) in enumerate(((2.4, 0.45), (4.1, 0.5), (0.9, 0.55))):
        cx, cy = R * d * math.cos(a), R * d * math.sin(a)
        lf = sp.polar_disc(f"Leaf{i}", lambda t: 0.014 * (1 + 0.08 * math.sin(5 * t)), rings=6, segments=40)
        lf.scale = (1.0, 0.62, 1.0)
        sp.displace(lf, lambda x, y, z, at: (x, y, 0.0025 * (1 - at["edge"] ** 2)))
        lf.location = (cx, cy, dome(R * d) + 0.004)
        lf.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.2, 0.2), a + 1.3)
        sh.assign(lf, leaf)
        st = sp.box(f"Stem{i}", (0.022, 0.006, 0.003), bevel=0.0012, segments=2)
        st.location = (cx - 0.012 * math.cos(a + 1.3), cy - 0.012 * math.sin(a + 1.3), dome(R * d) + 0.004)
        st.rotation_euler = (0.0, 0.0, a + 1.3)
        sh.assign(st, stem)
        objs += [lf, st]
    green = sh.plastic("Scallion", "#63b33d", 0.35, coat=0.3, sss=0.3)
    chili = sh.plastic("Chili", "#c8281a", 0.3, coat=0.5)
    for i in range(16):
        a = rnd.uniform(0, 2 * math.pi)
        d = R * math.sqrt(rnd.uniform(0.02, 0.85))
        mat = chili if i % 4 == 0 else green
        ring = sp.sweep(f"Ring{i}", sp.circle(0.0026, 20), [(0.0, 0.0), (0.0, 0.0024), (-0.001, 0.0024), (-0.001, 0.0)], sharp_deg=None)
        ring.location = (d * math.cos(a), d * math.sin(a), dome(d) + 0.0008)
        ring.rotation_euler = (math.radians(rnd.uniform(-25, 25)), math.radians(rnd.uniform(-25, 25)), 0.0)
        sh.assign(ring, mat)
        objs.append(ring)
    return objs


def bottle(b: dict, label_id: str, seed: int = 1) -> list:
    """A PET bottle of water with grip grooves, a wrap label and a knurled blue cap, drawn by the clear-body rule."""
    R = _m(b["r"])
    h = _m(b["h"])
    b0, b1 = _m(b["band"][0]), _m(b["band"][1])
    out = sp.circle(R, 160)
    neck = -R + 0.0135
    prof = [(-R + 0.004, 0.0006), (-R + 0.012, 0.0), (-0.012, 0.0004), (-0.004, 0.002), (-0.0008, 0.0055), (0.0, 0.010),
            (0.0, 0.046), (-0.0017, 0.050), (-0.0017, 0.053), (0.0, 0.057), (0.0, 0.066), (-0.0017, 0.070), (-0.0017, 0.073),
            (0.0, 0.077), (0.0, b0 - 0.004), (0.0, b1 + 0.004), (0.0, 0.163), (-0.0014, 0.166), (0.0, 0.169), (-0.0008, 0.176),
            (-0.004, 0.186), (-0.009, 0.195), (-0.014, 0.201), (neck + 0.0012, 0.206), (neck, 0.209),
            (neck + 0.0035, 0.2095), (neck + 0.0035, 0.2115), (neck, 0.212), (neck, h - 0.013)]
    shell = sp.sweep("Bottle", out, prof, cap_bottom=True, cap_top=True, sharp_deg=None)
    # the clear-body rule (shading.clear_body): a light, cool, opaque body of water up to the shoulder, paler air in
    # the neck, bright speculars; nothing behind the bottle shows through it
    sh.assign(shell, sh.clear_body("PET", body="#7db8d6", air="#bcd3e0", water_z=0.186, glow=0.17))
    band = sp.sweep("BottleLabel", out, [(0.0004, b0), (0.0004, b1)], label_z=(b0, b1), label_u0=0.5, sharp_deg=None)
    sh.assign(band, sh.two_sided("L2_" + label_id, sh.label("L_" + label_id, label_id), sh.paper("LabelBack", "#eef3f6", 0.6)))
    cap_r = R + neck + 0.0018
    cap = sp.sweep("Cap", sp.knurled(cap_r, 0.00045, 44), [(0.0, h - 0.0165), (0.0, h - 0.0012), (-0.0008, h)], cap_bottom=True,
                   cap_top=True, sharp_deg=None)
    sh.assign(cap, sh.plastic("CapBlue", "#2f7fd4", 0.32, coat=0.15))
    ring = sp.sweep("CapRing", sp.circle(cap_r - 0.0002, 96), [(0.0, h - 0.0205), (0.0, h - 0.017)], cap_bottom=True, sharp_deg=None)
    sh.assign(ring, sh.plastic("CapRing", "#3a86d6", 0.35))
    return [shell, band, cap, ring]


def jar(j: dict, label_id: str | None, seed: int = 1) -> list:
    """A glass jar with a shoulder, a wrap label and a lacquered screw lid, filled with golden syrup (clear-body rule)."""
    R, h = _m(j["r"]), _m(j["h"])
    out = sp.circle(R, 160)
    prof = [(-R + 0.006, 0.0), (-0.004, 0.0), (-0.0006, 0.004), (0.0, 0.009), (0.0, h - 0.028), (-0.004, h - 0.018), (-0.007, h - 0.015),
            (-0.007, h - 0.012), (-0.0072, h - 0.004)]
    glass = sp.sweep("Jar", out, prof, cap_bottom=True, sharp_deg=None)
    sh.assign(glass, sh.clear_body("JarGlass", body="#e0b24e", air="#d8dccf", water_z=h - 0.03))
    objs = [glass]
    if label_id:
        band = sp.sweep("JarLabel", out, [(0.0003, 0.02), (0.0003, h - 0.034)], label_z=(0.02, h - 0.034), label_u0=0.5, sharp_deg=None)
        sh.assign(band, sh.label("L_" + label_id, label_id))
        objs.append(band)
    lid_mat = sh.plastic("JarLid", "#b3281e", 0.42, coat=0.5)
    lid = sp.sweep("JarLid", sp.knurled(R - 0.0055, 0.0003, 90), [(-0.0005, h - 0.0135), (0.0, h - 0.0125), (0.0, h - 0.0012)], sharp_deg=None)
    # the top from a plain circle: offsetting the ridged outline far inward would fold it over itself
    top = sp.sweep("JarLidTop", sp.circle(R - 0.0055 + 0.0003, 160), [(0.0, h - 0.0012), (-0.0015, h), (-0.004, h + 0.0002), (-0.006, h - 0.0008)],
                   cap_top=True, sharp_deg=None)
    for ob in (lid, top):
        sh.assign(ob, lid_mat)
        objs.append(ob)
    return objs


def box(bx: dict, label_id: str | None, seed: int = 1) -> list:
    """A folding carton in library cardboard with its flap seams, and a printed front decal."""
    w, d, h = _m(bx["w"]), _m(bx["d"]), _m(bx["h"])
    body = sp.box("Carton", (w, d, h), bevel=0.0012, segments=2)
    lib.assign(body, "cardboard", tint=bx.get("tint", "light"), wear=0.25, dirt=0.05, seed=lib_seed(seed))
    objs = [body]
    seam = sp.box("Flap", (w * 0.995, 0.0006, 0.0008), bevel=0.0002, segments=1)
    seam.location = (0.0, 0.0, h - 0.0002)
    lib.assign(seam, "cardboard", tint="dark", wear=0.0, dirt=0.0, seed=lib_seed(seed + 1))
    objs.append(seam)
    if label_id:
        dec = sp.sheet("CartonPrint", w * 0.96, h * 0.94, 2, 2)
        dec.rotation_euler = (math.pi / 2, 0.0, 0.0)
        dec.location = (0.0, -d / 2 - 0.0003, h / 2)
        sh.assign(dec, sh.decal("D_" + label_id, label_id, rough=0.6))
        objs.append(dec)
    return objs


def _sack_ring(z: float, w: float, d: float, h: float, n: int) -> np.ndarray:
    """One cross-section of a filled sack standing open: bulging sides, a slightly flared mouth at the top."""
    t = z / h
    k = math.sin(math.pi * min(1.0, t / 0.9))
    flare = max(0.0, (t - 0.9) / 0.1)
    a = w / 2 * (0.88 + 0.12 * k + 0.05 * flare)
    b = d / 2 * (0.86 + 0.14 * k + 0.05 * flare)
    p = 2.8
    fold = 0.035 * max(0.0, (t - 0.7) / 0.3) ** 1.5
    pts = []
    for i in range(n):
        th = 2 * math.pi * i / n - math.pi / 2
        c, s_ = math.cos(th), math.sin(th)
        x = a * math.copysign(abs(c) ** (2 / p), c)
        y = b * math.copysign(abs(s_) ** (2 / p), s_)
        m = 1.0 + fold * math.sin(11 * th + 1.3)
        pts.append((x * m, y * m, z))
    return np.array(pts)


def sack(s: dict, label_id: str, seed: int = 1) -> list:
    """An open hessian sack (the source's Organic Fragrant Rice): bulging body, the mouth rolled down into a thick
    rim, a heaped mound of rice showing, and a large printed emblem on the front as an ink decal on the cloth."""
    w, d, h = _m(s["w"]), _m(s["d"]), _m(s["h"])
    n, rings = 144, 56
    zs = [h * k / (rings - 1) for k in range(rings)]
    secs = [_sack_ring(z, w, d, h, n) for z in zs]
    secs[0][:, :2] *= 0.92
    noise = mathutils.noise
    off = mathutils.Vector((seed * 0.37 % 7.1, seed * 0.11 % 5.3, 1.7))
    for sec in secs:
        for p in sec:
            v = mathutils.Vector((p[0] * 16, p[1] * 16, p[2] * 7)) + off
            r = math.hypot(p[0], p[1]) or 1e-6
            bump = 0.0035 * noise.noise(v) + 0.0012 * noise.noise(v * 3.1)
            p[0] += p[0] / r * bump
            p[1] += p[1] / r * bump
    body = sp.loft("Sack", secs, cap_bottom=True)
    sp.solidify(body, 0.0015, offset=-1.0)
    sp.subdivide(body, 1)
    cloth = sh.hessian("Hessian", color="#b9a57c", pitch_m=0.0026)
    sh.assign(body, cloth)
    objs = [body]
    mouth = secs[-1]
    rr = 0.011
    rim_pts = []
    for p in mouth[::3]:
        r = math.hypot(p[0], p[1])
        rim_pts.append((p[0] * (r + rr * 0.55) / r, p[1] * (r + rr * 0.55) / r, h - rr * 0.35))
    rim = sp.tube("Rim", rim_pts, rr, cyclic=True, resolution=3, bevel_res=5)
    sh.assign(rim, cloth)
    objs.append(rim)
    mound = []
    for k in range(12):
        f = 1 - k / 12
        z = h - 0.006 + 0.05 * (1 - f * f) ** 0.8
        ring = mouth.copy()
        ring[:, :2] *= 0.97 * f
        ring[:, 2] = z
        for p in ring:
            p[2] += 0.002 * noise.noise(mathutils.Vector((p[0] * 60, p[1] * 60, 3.0)) + off)
        mound.append(ring)
    rice = sp.loft("Rice", mound, cap_top=True)
    sh.assign(rice, sh.rice("Rice"))
    objs.append(rice)
    lw, lh, lz = 0.17, 0.17, h * 0.43
    order = [(i + 3 * n // 4 + 1) % n for i in range(n // 2 - 1)]
    front = []
    for sec, z in zip(secs, zs):
        if lz - lh / 2 - 0.01 <= z <= lz + lh / 2 + 0.01:
            ring = sec[order].copy()
            r = np.hypot(ring[:, 0], ring[:, 1])[:, None]
            ring[:, :2] += ring[:, :2] / r * 0.0012
            front.append(ring)
    dec = sp.loft("SackPrint", front, closed=False, label_uv=lambda x, y, z: (0.5 + x / lw, 0.5 + (z - lz) / lh))
    sp.subdivide(dec, 1)
    sh.assign(dec, sh.decal("D_" + label_id, label_id, rough=0.9))
    objs.append(dec)
    return objs


def pillow(p: dict, label_id: str, seed: int = 1) -> list:
    """A pillow pack (crisps, instant noodles): a puffed film sachet with crimped seals top and bottom."""
    w, hgt, puff = _m(p["w"]), _m(p["h"]), _m(p.get("puff", 28))
    crimp = 0.012

    def fn(u, v):
        y = (v - 0.5) * hgt
        core = max(0.0, 1 - abs(2 * u - 1) ** 3) * max(0.0, min(1.0, (hgt / 2 - abs(y)) / crimp - 0.0)) ** 0.7
        teeth = 0.0006 * math.sin(u * 180.0) if abs(y) > hgt / 2 - crimp else 0.0
        return (0.0, 0.0, puff / 2 * core ** 0.6 + teeth)
    top = sp.sheet("PackFront", w, hgt, 60, 80, fn)
    back = sp.sheet("PackBack", w, hgt, 60, 80, lambda u, v: (0.0, 0.0, -fn(u, v)[2] * 0.7))
    for ob in (top, back):
        ob.location.z = puff / 2
    back.data.flip_normals()
    sh.assign(top, sh.label("L_" + label_id, label_id, extension="CLIP"))
    sh.assign(back, sh.plastic("PackBack", "#c9241b", 0.3, coat=0.4))
    return [top, back]


def packet(p: dict, label_id: str, seed: int = 1) -> list:
    """A kraft paper seed packet, puffed a little by the seeds, its top 15 mm heat-crimped: fine ridges across and a
    serrated edge."""
    w, hgt = _m(p["w"]), _m(p["h"])
    rnd = random.Random(seed)
    lumps = [(rnd.uniform(0.2, 0.8), rnd.uniform(0.12, 0.6), rnd.uniform(0.6, 1.0)) for _ in range(9)]
    crimp = 0.015 / hgt
    nx, ny = 72, 104

    def fn(u, v):
        env = max(0.0, 1 - abs(2 * u - 1) ** 6) * max(0.0, 1 - abs((2 * v - 1) / (1 - crimp)) ** 6) if v < 1 - crimp else 0.0
        z = 0.0024 * env
        for lu, lv, a in lumps:
            z += 0.0011 * a * env * math.exp(-(((u - lu) * w) ** 2 + ((v - lv) * hgt) ** 2) / (2 * 0.006 ** 2))
        if v >= 1 - crimp:
            z += 0.00035 * math.sin(u * nx * math.pi)
        dy = 0.0012 * (1 if round(u * nx) % 2 else -1) if v >= 0.999 else 0.0
        return (0.0, dy, z)
    sheet = sp.sheet("Packet", w, hgt, nx, ny, fn)
    sp.solidify(sheet, 0.0003, offset=-1.0)
    sh.assign(sheet, sh.label("L_" + label_id, label_id, extension="CLIP", print_bump=0.12))
    return [sheet]


def pull_ring(x: float, y: float, z: float, size: float, seed: int = 1) -> list:
    """An easy-open pull ring lying on a lid: a flattened wire loop, its tab and the rivet."""
    rx, ry = size * 0.62, size * 0.42
    pts = [(x + rx * math.cos(a), y + ry * math.sin(a), z + 0.0009) for a in (2 * math.pi * i / 24 for i in range(24))]
    ring = sp.tube("PullRing", pts, 0.0011, cyclic=True, resolution=4, bevel_res=3)
    ring.scale.z = 0.55
    ring.location.z = z * 0.45 + 0.0004
    tab = sp.box("PullTab", (size * 0.95, ry * 1.1, 0.0006), bevel=0.0002, segments=2)
    tab.location = (x + rx * 0.9, y, z)
    rivet = sp.sweep("Rivet", sp.circle(0.0024, 32), [(0.0, 0.0), (0.0, 0.0004), (-0.0008, 0.0009), (-0.0018, 0.0011)],
                     cap_top=True, sharp_deg=None)
    rivet.location = (x + rx * 1.35, y, z + 0.0004)
    for ob in (ring, tab, rivet):
        lib.assign(ob, "metal_brushed", tint="aluminium", wear=0.05, dirt=0.0, seed=lib_seed(seed))
    return [ring, tab, rivet]
