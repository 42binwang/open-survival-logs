"""The dish template: vessels (plate, bowl, pot) and the food that goes in them, with quality variants.

A vessel builder returns (objects, floor z, usable radius); a food builder places its pieces on that floor. Quality
changes the cooking, not the recipe: 'perfect' is neatly plated, glossy and garnished; 'good' a little less so;
'normal' plain, more deeply seared and unevenly placed; 'failed' charred.
"""

from __future__ import annotations

import math
import random

from materials import library as lib

from . import shading as sh
from . import shapes as sp
from .containers import lib_seed

MM = 0.001

QUALITY = {
    "perfect": {"lace": 0.25, "burn": 0.0, "yolk": "#f5a114", "gloss": 1.0, "sear": 0.8, "char": 0.06, "oil": 0.65, "garnish": True, "mess": 0.0, "yolk_h": 1.0},
    "good": {"lace": 0.45, "burn": 0.0, "yolk": "#f2a524", "gloss": 0.7, "sear": 0.8, "char": 0.15, "oil": 0.5, "garnish": True, "mess": 0.3, "yolk_h": 0.9},
    "normal": {"lace": 0.9, "burn": 0.15, "yolk": "#e6a83e", "gloss": 0.25, "sear": 0.95, "char": 0.45, "oil": 0.25, "garnish": False, "mess": 1.0, "yolk_h": 0.7},
    "failed": {"lace": 1.0, "burn": 0.85, "yolk": "#8f7440", "gloss": 0.0, "sear": 1.0, "char": 1.0, "oil": 0.05, "garnish": False, "mess": 1.4, "yolk_h": 0.5},
}


# ------------------------------------------------------------------------------------------ vessels

def plate(d_mm: float, seed: int = 1):
    """A glazed stoneware plate with a foot ring, a shallow well and a raised rim with a blue line."""
    R = d_mm * MM / 2
    k = R / 0.115
    prof = [(-R + 0.002, 0.0065), (-0.062 * k, 0.0065), (-0.059 * k, 0.0015), (-0.057 * k, 0.0), (-0.054 * k, 0.0), (-0.052 * k, 0.0015),
            (-0.050 * k, 0.0055), (-0.035 * k, 0.008), (-0.018 * k, 0.013), (-0.006 * k, 0.019), (0.0, 0.0215), (0.0004, 0.0228),
            (-0.0006, 0.0241), (-0.003 * k, 0.024), (-0.015 * k, 0.0205), (-0.030 * k, 0.0145), (-0.040 * k, 0.011), (-0.046 * k, 0.0103),
            (-R + 0.002, 0.0103)]
    ob = sp.sweep("Plate", sp.circle(R, 192), prof, cap_bottom=True, cap_top=True, sharp_deg=None)
    sh.assign(ob, sh.ceramic("Stoneware", "#f4f2eb", rim="#3b5f95", rim_r=(R - 0.0105 * k, R - 0.0085 * k)))
    return [ob], 0.0103, R - 0.046 * k


def bowl(d_mm: float, h_mm: float, seed: int = 1):
    """A rice bowl: foot ring, a deep curved wall, a rounded lip, glazed inside and out."""
    R, H = d_mm * MM / 2, h_mm * MM
    prof = [(-R + 0.002, 0.004), (-R * 0.55, 0.004), (-R * 0.52, 0.0), (-R * 0.44, 0.0), (-R * 0.42, 0.006), (-R * 0.25, H * 0.2),
            (-R * 0.1, H * 0.55), (-R * 0.02, H * 0.85), (0.0, H), (-0.0025, H + 0.0012), (-0.0045, H - 0.0005), (-R * 0.06, H * 0.82),
            (-R * 0.16, H * 0.5), (-R * 0.32, H * 0.22), (-R * 0.5, 0.012), (-R + 0.002, 0.011)]
    ob = sp.sweep("Bowl", sp.circle(R, 160), prof, cap_bottom=True, cap_top=True, sharp_deg=None)
    sh.assign(ob, sh.ceramic("BowlGlaze", "#f2efe6", rim="#8a2f24", rim_r=(R - 0.004, R - 0.0025)))
    return [ob], 0.011, R * 0.5


def pot(d_mm: float, h_mm: float, seed: int = 1):
    """A small cooking pot in library brushed steel with a rolled rim and two side handles."""
    R, H = d_mm * MM / 2, h_mm * MM
    prof = [(-R + 0.002, 0.0015), (-0.004, 0.0015), (-0.001, 0.0), (0.0, 0.004), (0.0, H - 0.003), (0.0012, H - 0.0012), (0.0006, H),
            (-0.0012, H - 0.0004), (-0.0012, 0.004), (-0.004, 0.0028), (-R + 0.002, 0.0028)]
    ob = sp.sweep("Pot", sp.circle(R, 160), prof, cap_bottom=True, cap_top=True, sharp_deg=None)
    lib.assign(ob, "metal_brushed", tint="steel", wear=0.2, dirt=0.1, seed=lib_seed(seed))
    objs = [ob]
    for side in (-1, 1):
        hd = sp.tube(f"Handle{side}", [(side * (R - 0.001), -0.018, H * 0.8), (side * (R + 0.016), -0.014, H * 0.84),
                                      (side * (R + 0.02), 0.0, H * 0.86), (side * (R + 0.016), 0.014, H * 0.84),
                                      (side * (R - 0.001), 0.018, H * 0.8)], 0.003)
        lib.assign(hd, "metal_brushed", tint="steel", wear=0.3, dirt=0.1, seed=lib_seed(seed + 1))
        objs.append(hd)
    return objs, 0.0028, R - 0.002


def board(w_mm: float, d_mm: float, seed: int = 1):
    """A wooden serving tray, the source's way of showing a cooked dish: a rounded-rectangle board of warm pine with a
    low raised lip, sized so the food fills it (the library laminate reads dark red or grey at this size)."""
    w, d = w_mm * MM, d_mm * MM
    r = 0.018
    prof = [(-0.004, 0.0), (-0.001, 0.0008), (0.0, 0.004), (0.0, 0.012), (-0.0015, 0.0148), (-0.005, 0.0155), (-0.0085, 0.0138),
            (-0.0105, 0.0085), (-0.013, 0.0072), (-0.0175, 0.0072)]
    ob = sp.sweep("Board", sp.rounded_rect(w, d, r, 192), prof, cap_bottom=True, cap_top=True, sharp_deg=None)
    sh.assign(ob, sh.pine("TrayWood", light="#cf9150", dark="#9a5a26", axis="X", seed=seed, scale=0.7))
    return [ob], 0.0072, min(w, d) / 2 - 0.02


VESSELS = {"plate": plate, "bowl": bowl, "pot": pot, "board": board}


# ------------------------------------------------------------------------------------------ food

def fried_egg(cx: float, cy: float, z: float, r: float, q: dict, rnd: random.Random, broken: bool = False, runny: bool = False) -> list:
    """An egg white that spreads with a wavy rim and thins towards it, and a domed yolk (broken: a low yolk that has
    run into a flat yellow spill; runny: a full yolk with a small glossy run towards the front)."""
    ph = [rnd.uniform(0, 6.28) for _ in range(4)]
    irr = 0.5 + 0.8 * q["mess"]

    def radius(a):
        return r * (1 + irr * (0.07 * math.sin(3 * a + ph[0]) + 0.045 * math.sin(5 * a + ph[1]) + 0.025 * math.sin(11 * a + ph[2])))
    white = sp.polar_disc("EggWhite", radius, rings=30, segments=160, z=0.0, uv_d=2 * r)
    yx, yy = r * 0.12 * (1 - q["mess"] * 0.3), r * 0.05

    def shape(x, y, zz, attrs):
        f = attrs["edge"]
        dy = math.hypot(x - yx, y - yy) / r
        hgt = 0.0042 * (1 - f ** 2.2) + 0.0006 + 0.0018 * math.exp(-(dy / 0.45) ** 2)
        hgt += 0.0004 * math.sin(x * 900 + ph[3]) * math.sin(y * 800) * f
        return (x, y, hgt)
    sp.displace(white, shape)
    sp.solidify(white, 0.0007, offset=-1.0)
    sh.assign(white, sh.egg_white("EggWhite", lace=q["lace"], burn=q["burn"]))
    white.location = (cx, cy, z)
    yr = r * (0.44 if runny else 0.34)
    yh = 0.0125 * q["yolk_h"] * (0.55 if broken else 1.0)
    prof = [(0.0, 0.0), (-yr * 0.08, yh * 0.35), (-yr * 0.25, yh * 0.7), (-yr * 0.5, yh * 0.9), (-yr * 0.8, yh * 0.99), (-yr + 0.0005, yh)]
    y = sp.sweep("Yolk", sp.circle(yr, 96), prof, cap_top=True, cap_bottom=True, sharp_deg=None)
    ymat = sh.yolk("Yolk", q["yolk"], q["gloss"])
    sh.assign(y, ymat)
    y.location = (cx + yx, cy + yy, z + 0.0035)
    out = [white, y]
    if broken or runny:
        k, ang = (0.9, 2.4) if broken else (0.55, -1.9)
        spill = sp.polar_disc("YolkSpill", lambda a: yr * ((1.25 if broken else 0.9) + k * max(0.0, math.cos(a - ang)) ** 3 + 0.12 * math.sin(4 * a)), rings=10, segments=64)

        def drape(x, y, zz, attrs):
            f = min(1.0, math.hypot(x + yx, y + yy) / r)
            dy = math.hypot(x, y) / r
            return (x, y, 0.0042 * (1 - f ** 2.2) + 0.0006 + 0.0018 * math.exp(-(dy / 0.45) ** 2) + 0.0004 + 0.0012 * (1 - attrs["edge"]))
        sp.displace(spill, drape)
        sh.assign(spill, ymat)
        spill.location = (cx + yx, cy + yy, z)
        out.append(spill)
    return out


def luncheon_slices(cx: float, cy: float, z: float, q: dict, rnd: random.Random, n: int = 3, spread: float = 1.0, slide: float = 0.0,
                    shingle: bool = False) -> list:
    """Overlapping slices fanned from (cx, cy); `spread` pulls them further apart, `slide` tips them (degrees about
    Y) as if sliding off over the plate's rim; `shingle` lays them long side front to back, each 18 mm to the side
    of the last, so every browned edge shows and the slices read apart at 64 px."""
    mat = sh.luncheon("Luncheon", sear=q["sear"], char=q["char"], gloss=q["oil"], burn=q["burn"])
    objs = []
    for i in range(n):
        s = sp.box(f"Slice{i}", (0.074, 0.046, 0.012), bevel=0.0032, segments=3)
        m = q["mess"]
        if shingle:
            s.location = (cx + 0.018 * i, cy - 0.004 * i, z + 0.0065 * i)
            s.rotation_euler = (0.0, math.radians(-8.0 if i else 0.0), math.radians(94 - 3 * i))
            sh.assign(s, mat)
            objs.append(s)
            continue
        s.location = (cx + 0.014 * i * spread + rnd.uniform(-0.006, 0.006) * m, cy + 0.011 * i * spread + rnd.uniform(-0.008, 0.008) * m, z + 0.0075 * i)
        s.rotation_euler = (math.radians(rnd.uniform(-2, 2) * m), math.radians(-7.0 * (i > 0) + rnd.uniform(-4, 4) * m + slide),
                            math.radians(58 - 9 * i + rnd.uniform(-18, 18) * m))
        sh.assign(s, mat)
        objs.append(s)
    return objs


def garnish(area: list, z: float, rnd: random.Random, scallions: int = 16, pepper: int = 26) -> list:
    """Chopped scallion rings and cracked pepper over the food; area = [(x, y, r, z_top)] discs to scatter on."""
    green = sh.plastic("Scallion", "#5fae3a", 0.35, coat=0.3, sss=0.3)
    dark = sh.plastic("Pepper", "#26211c", 0.6)
    objs = []
    for i in range(scallions):
        x, y, r, zt = area[i % len(area)]
        a, d = rnd.uniform(0, 6.28), r * math.sqrt(rnd.uniform(0, 1))
        ring = sp.sweep(f"Scallion{i}", sp.circle(0.0021, 20), [(0.0, 0.0), (0.0, 0.0024), (-0.0009, 0.0024), (-0.0009, 0.0)], sharp_deg=None)
        ring.location = (x + d * math.cos(a), y + d * math.sin(a), zt + 0.0004)
        ring.rotation_euler = (math.radians(rnd.uniform(60, 110)), 0.0, rnd.uniform(0, 3.14))
        sh.assign(ring, green)
        objs.append(ring)
    for i in range(pepper):
        x, y, r, zt = area[i % len(area)]
        a, d = rnd.uniform(0, 6.28), r * math.sqrt(rnd.uniform(0, 1))
        p = sp.box(f"Pepper{i}", (0.0009, 0.0007, 0.0005), bevel=0.0002, segments=1)
        p.location = (x + d * math.cos(a), y + d * math.sin(a), zt + 0.0002)
        p.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3))
        sh.assign(p, dark)
        objs.append(p)
    return objs


def scorched_plate(floor: float, radius: float, rnd: random.Random) -> list:
    """What a burnt fry-up leaves on the board: smears of dark grease and scattered charred crumbs."""
    grease = sh.plastic("Grease", "#3b2412", 0.12, coat=0.9)
    crumb = sh.plastic("Char", "#1d130c", 0.8, bump=0.6, bump_scale=900.0)
    objs = []
    for i in range(6):
        a = rnd.uniform(0, 6.28)
        d = radius * rnd.uniform(0.55, 1.25)
        r0 = rnd.uniform(0.006, 0.013)
        k = rnd.uniform(1.6, 2.6)
        sm = sp.polar_disc(f"Smear{i}", lambda t, r0=r0, k=k: r0 * (1 + 0.25 * math.sin(3 * t) + 0.12 * math.sin(7 * t)), rings=6, segments=48)
        sm.scale = (k, 1.0, 1.0)
        sm.rotation_euler = (0.0, 0.0, a + rnd.uniform(-0.6, 0.6))
        z_rim = floor + max(0.0, d - radius) * 0.0
        sm.location = (d * math.cos(a), d * math.sin(a), z_rim + 0.0003)
        sh.assign(sm, grease)
        objs.append(sm)
    for i in range(34):
        a = rnd.uniform(0, 6.28)
        d = radius * math.sqrt(rnd.uniform(0.05, 1.6))
        s = rnd.uniform(0.0015, 0.0042)
        c = sp.box(f"Crumb{i}", (s, s * rnd.uniform(0.5, 1.0), s * 0.6), bevel=s * 0.2, segments=1)
        c.location = (d * math.cos(a), d * math.sin(a), floor + max(0.0, d - radius) * 0.0 + s * 0.2)
        c.rotation_euler = (rnd.uniform(0, 3), rnd.uniform(0, 3), rnd.uniform(0, 3))
        sh.assign(c, crumb)
        objs.append(c)
    return objs


def luncheon_egg(floor: float, radius: float, quality: str, seed: int) -> list:
    """Luncheon meat and a fried egg. Neat tiers fan the slices in front and set the egg behind; careless tiers
    (mess > 0.5) drop the egg in front with its yolk broken and pile the slices behind it."""
    q = QUALITY[quality]
    rnd = random.Random(seed)
    if q["burn"] > 0.5:
        ex, ey, er = radius * 0.45, -radius * 0.3, radius * 0.92
        objs = fried_egg(ex, ey, floor, er, q, rnd, broken=True)
        objs += luncheon_slices(-radius * 0.95, radius * 0.1, floor + 0.009, q, rnd, spread=1.9, slide=-11.0)
    elif q["mess"] > 0.5:
        ex, ey, er = radius * 0.3, -radius * 0.32, radius * 0.8
        objs = fried_egg(ex, ey, floor, er, q, rnd, broken=True)
        objs += luncheon_slices(-radius * 0.5, radius * 0.05, floor + 0.0005, q, rnd)
    else:
        ex, ey, er = -radius * 0.5, -radius * 0.25, radius * 0.95
        objs = luncheon_slices(radius * 0.25, radius * 0.25, floor + 0.0005, q, rnd, shingle=True)
        objs += fried_egg(ex, ey, floor, er, q, rnd, runny=True)
    if q["garnish"]:
        objs += garnish([(ex, ey, er * 0.7, floor + 0.0055), (radius * 0.28, -radius * 0.2, radius * 0.3, floor + 0.02)], floor, rnd)
    elif q["burn"] > 0.5:
        objs += scorched_plate(floor, radius, rnd)
    else:
        oil = sh.plastic("Oil", "#c9a24a", 0.05, coat=1.0)
        for i in range(3):
            o = sp.polar_disc(f"Oil{i}", lambda a, r=rnd.uniform(0.004, 0.008): r * (1 + 0.15 * math.sin(3 * a)), rings=4, segments=32)
            o.location = (rnd.uniform(-radius, radius) * 0.7, rnd.uniform(-radius, radius) * 0.7, floor + 0.0002)
            sh.assign(o, oil)
            objs.append(o)
    return objs


def rice_mound(floor: float, radius: float, quality: str, seed: int) -> list:
    """Steamed rice heaped in a bowl: a dome whose grains come from the rice shader."""
    top = radius * 1.35
    prof = [(0.0, 0.0), (-radius * 0.05, top * 0.35), (-radius * 0.2, top * 0.7), (-radius * 0.45, top * 0.92), (-radius * 0.75, top * 1.0),
            (-radius + 0.002, top * 1.02)]
    m = sp.sweep("Rice", sp.circle(radius * 1.9, 96), [(o - radius * 0.9, z) for o, z in prof], cap_top=True, sharp_deg=None)
    m.location.z = floor - 0.002
    sh.assign(m, sh.rice("Rice"))
    return [m]


def stew(floor: float, radius: float, quality: str, seed: int) -> list:
    """A pot of stew: a glossy broth surface and chunks of potato and carrot breaking it."""
    rnd = random.Random(seed)
    surf = sp.polar_disc("Broth", lambda a: radius, rings=12, segments=96, z=floor + 0.05)
    sh.assign(surf, sh.plastic("Broth", "#7b3d1b", 0.08, coat=0.8, sss=0.2))
    objs = [surf]
    pot_m = sh.plastic("Potato", "#e6c47a", 0.5, sss=0.3)
    car_m = sh.plastic("Carrot", "#e0702a", 0.4, sss=0.4)
    for i in range(9):
        a, d = rnd.uniform(0, 6.28), radius * 0.75 * math.sqrt(rnd.uniform(0.05, 1))
        if i % 3 == 2:
            c = sp.sweep(f"Carrot{i}", sp.circle(0.009, 32), [(0.0, 0.0), (0.0, 0.006)], cap_bottom=True, cap_top=True)
            sh.assign(c, car_m)
        else:
            c = sp.box(f"Potato{i}", (0.016, 0.014, 0.013), bevel=0.003, segments=2)
            sh.assign(c, pot_m)
        c.location = (d * math.cos(a), d * math.sin(a), floor + 0.044)
        c.rotation_euler = (rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.uniform(0, 3))
        objs.append(c)
    return objs


FOODS = {"luncheon_egg": luncheon_egg, "rice": rice_mound, "stew": stew}


def dish(spec: dict, quality: str, seed: int) -> list:
    vessel = spec["vessel"]
    if vessel == "plate":
        objs, floor, radius = plate(spec["d"], seed)
    elif vessel == "board":
        objs, floor, radius = board(spec["w"], spec["d"], seed)
    elif vessel == "bowl":
        objs, floor, radius = bowl(spec["d"], spec.get("h", 60), seed)
    else:
        objs, floor, radius = pot(spec["d"], spec.get("h", 90), seed)
    return objs + FOODS[spec["food"]](floor, radius, quality, seed)
