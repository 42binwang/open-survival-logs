"""Props that are not containers: a pan loaf with cut slices, a gauze bandage roll, planks, a snap mousetrap and a
hardcover book. Sizes in millimetres from catalog.json; origins on the floor."""

from __future__ import annotations

import math
import random

import bmesh
import numpy as np

from materials import library as lib

from . import shading as sh
from . import shapes as sp
from .containers import lib_seed

MM = 0.001


def _m(v):
    return v * MM


def material_by_normal(ob, index: int, axis: int, min_abs: float = 0.9) -> None:
    """Sets material `index` on faces whose normal points along `axis` (0 x, 1 y, 2 z) within min_abs."""
    for p in ob.data.polygons:
        if abs(p.normal[axis]) >= min_abs:
            p.material_index = index


# ------------------------------------------------------------------------------------------ bread

def _loaf_section(w: float, hh: float, n: int, scale: float = 1.0) -> list:
    """A pan-loaf cross-section in the YZ plane: flat base, near-vertical sides, a domed top that overhangs a little,
    a shallow score along the crown."""
    pts = []
    for i in range(n):
        th = 2 * math.pi * i / n - math.pi / 2
        c, s = math.cos(th), math.sin(th)
        if s < 0:
            p, a, b = 9.0, w / 2, hh * 0.5
        else:
            p, a, b = 2.3, w / 2 * 1.07, hh * 0.5
        y = a * math.copysign(abs(c) ** (2 / p), c)
        z = b * math.copysign(abs(s) ** (2 / p), s)
        if s > 0:
            z -= 0.004 * math.exp(-(y / 0.006) ** 2) * s
        pts.append((y * scale, (z + hh * 0.5) * scale + hh * 0.5 * (1 - scale) * 0.2))
    return pts


def bread(loaf: dict, seed: int = 1) -> list:
    """A pan loaf: crust over a rounded end and a flat cut end showing the crumb, and two slices fanned beside it."""
    l, w, hh = _m(loaf["l"]), _m(loaf["w"]), _m(loaf["h"])
    t = _m(loaf["slice"])
    n = 96
    x_cut = l / 2 - 2 * t - 0.004
    xs = np.linspace(-l / 2, x_cut, 44)
    secs = []
    for x in xs:
        u = (x + l / 2) / (l * 0.14)
        sc = math.sqrt(max(0.0, 1 - (1 - min(1.0, u)) ** 2)) if u < 1 else 1.0
        sc = max(sc, 0.02)
        secs.append(np.array([(x, y, z) for y, z in _loaf_section(w, hh, n, sc)]))
    body = sp.loft("Loaf", secs, cap_bottom=True)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(body.data)
    bm.free()
    sp.subdivide(body, 1)
    crust = sh.crust("Crust")
    crumb = sh.crumb("Crumb")
    sh.assign(body, crust)
    face = _section_cap("LoafCut", _loaf_section(w, hh, n), x_cut, +1)
    sh.assign(face, crumb)
    objs = [body, face]
    rnd = random.Random(seed)
    for i in range(int(loaf.get("slices", 2))):
        sl = _slice(w, hh, t, n, crust, crumb, i)
        lean = [72.0, 84.0][i % 2]
        sl.rotation_euler = (0.0, math.radians(lean), math.radians(-8 + 14 * i + rnd.uniform(-3, 3)))
        sl.location = (x_cut + 0.03 + i * 0.05, -0.012 - 0.018 * i, 0.0)
        objs.append(sl)
    return objs


def _section_cap(name: str, sec2d: list, x: float, facing: int):
    import bpy
    bm = bmesh.new()
    uvm = bm.loops.layers.uv.new("UVMap")
    verts = [bm.verts.new((x, y, z)) for y, z in sec2d]
    f = bm.faces.new(verts if facing > 0 else list(reversed(verts)))
    bmesh.ops.triangulate(bm, faces=[f])
    for face in bm.faces:
        for loop in face.loops:
            loop[uvm].uv = (loop.vert.co.y, loop.vert.co.z)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces and bm.faces[0].normal.x * facing < 0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _slice(w: float, hh: float, t: float, n: int, crust, crumb, i: int):
    """One slice lying in the YZ plane at x 0..t: a crust band between two crumb faces, set on its side later."""
    import bpy
    sec = _loaf_section(w, hh, n)
    band = sp.loft(f"SliceBand{i}", [np.array([(0.0, y, z) for y, z in sec]), np.array([(t, y, z) for y, z in sec])])
    bm = bmesh.new()
    bm.from_mesh(band.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(band.data)
    bm.free()
    sh.assign(band, crust)
    a = _section_cap(f"SliceA{i}", sec, 0.0, -1)
    b = _section_cap(f"SliceB{i}", sec, t, +1)
    for c in (a, b):
        sh.assign(c, crumb)
        c.parent = band
    band.data.materials.append(crumb)
    root = bpy.data.objects.new(f"Slice{i}", None)
    bpy.context.scene.collection.objects.link(root)
    band.parent = root
    band.location = (-t / 2, 0.0, -hh / 2)
    return root


# ------------------------------------------------------------------------------------------ bandage

def bandage(roll: dict, label_id: str, seed: int = 1, label_turn: float = 0.0) -> list:
    """A gauze roll lying on its side (axis along X) with a printed paper band, its free end unrolled towards the
    front along the floor."""
    R, W = _m(roll["r"]), _m(roll["w"])
    bw, tail = _m(roll["band"]), _m(roll["tail"])
    out = sp.circle(R, 160)
    body = sp.sweep("Roll", out, [(-0.0022, 0.0), (-0.0006, 0.0006), (0.0, 0.0022), (0.0, W - 0.0022), (-0.0006, W - 0.0006), (-0.0022, W)],
                    cap_bottom=True, cap_top=True, sharp_deg=None)
    gz = sh.gauze("Gauze", thread_m=0.0028)
    ends = sh.gauze_end("GauzeEnd")
    body.data.materials.append(gz)
    body.data.materials.append(ends)
    material_by_normal(body, 1, 2, 0.95)
    z0 = (W - bw) / 2
    band = sp.sweep("RollBand", out, [(0.0006, z0), (0.0006, z0 + bw)], label_z=(z0, z0 + bw), label_u0=0.5 + label_turn / 360.0, sharp_deg=None)
    sh.assign(band, sh.label("L_" + label_id, label_id, print_bump=0.02))
    for ob in (body, band):
        ob.rotation_euler = (0.0, math.radians(90), 0.0)
        ob.location = (-W / 2, 0.0, R)

    def fn(u, v):
        x = (u - 0.5) * W * 0.98 + 0.004 * math.sin(v * 5.0) * v
        z = 0.0005 + 0.0012 * math.sin(v * 9.0) * v + 0.012 * max(0.0, v - 0.86) ** 2 / 0.0196
        return (x, -v * tail, z)
    strip = sp.sheet("Tail", W * 0.98, tail, 24, 90, fn, absolute=True)
    sh.assign(strip, sh.gauze("GauzeOpen", thread_m=0.0028, open_weave=True))
    return [body, band, strip]


# ------------------------------------------------------------------------------------------ planks

def planks(p: dict, seed: int = 1) -> list:
    """Rough-sawn pine planks: two side by side and one across them, end grain on the sawn ends."""
    l, w, t = _m(p["l"]), _m(p["w"]), _m(p["t"])
    rnd = random.Random(seed)
    objs = []
    layout = [(0.0, -w / 2 - 0.003, 0.0, 1.5), (0.012, w / 2 + 0.003, 0.0, -1.0), (-0.01, 0.0, t, 9.0)]
    for i, (x, y, z, rz) in enumerate(layout[: int(p.get("n", 3))]):
        ob = sp.box(f"Plank{i}", (l, w, t), bevel=0.0016, segments=2)
        long = sh.pine(f"Pine{i}", light="#d39a56", dark="#83471d", axis="X", seed=seed + i, knots=0.9, contrast=1.0)
        end = sh.pine(f"PineEnd{i}", light="#c98f4e", dark="#7a4219", axis="X", end_grain=True, seed=seed + i, contrast=1.0)
        ob.data.materials.append(long)
        ob.data.materials.append(end)
        material_by_normal(ob, 1, 0, 0.9)
        ob.location = (x, y, z)
        ob.rotation_euler = (0.0, 0.0, math.radians(rz + rnd.uniform(-1, 1)))
        objs.append(ob)
    return objs


# ------------------------------------------------------------------------------------------ mousetrap

def mousetrap(tr: dict, label_id: str, seed: int = 1) -> list:
    """A snap mousetrap, set: pine base with a red stamp, galvanised wire hammer, twin coil springs, hold-down bar,
    a tin trigger pedal with a cube of cheese."""
    L, W, T = _m(tr["l"]), _m(tr["w"]), _m(tr["t"])
    base = sp.box("TrapBase", (L, W, T), bevel=0.0009, segments=2)
    base.data.materials.append(sh.pine("TrapPine", light="#dfc08e", dark="#c29a62", axis="X", seed=seed, scale=0.6))
    base.data.materials.append(sh.pine("TrapPineEnd", light="#d4b27c", dark="#a87f4c", axis="X", end_grain=True, seed=seed, scale=0.6))
    material_by_normal(base, 1, 0, 0.9)
    stamp = sp.sheet("TrapStamp", 0.036, 0.036, 2, 2)
    stamp.location = (-0.026, 0.0, T + 0.00015)
    stamp.rotation_euler = (0.0, 0.0, math.radians(90))
    sh.assign(stamp, sh.decal("D_" + label_id, label_id, rough=0.7))
    wire = sh.metal("Galvanised", "#bfc1bd", 0.32, bump=0.1)
    tin = sh.metal("TinPlate", "#cfcfca", 0.28)
    objs = [base, stamp]
    px = 0.004
    zt = T + 0.0009
    for side in (-1, 1):
        sprg = sp.helix(f"Spring{side}", 0.0032, 0.0017, 5.5, 0.00075, axis="X")
        sprg.rotation_euler = (0.0, 0.0, math.radians(90))
        sprg.location = (px, side * 0.0125, T + 0.0034)
        sh.assign(sprg, wire)
        arm = sp.tube(f"SpringArm{side}", [(px, side * 0.0165, T + 0.004), (px + 0.012, side * 0.019, T + 0.0012), (px + 0.02, side * 0.019, T + 0.0008)], 0.0007)
        sh.assign(arm, wire)
        objs += [sprg, arm]
    hammer = sp.tube("Hammer", [(px, -0.0215, zt + 0.0022), (px - 0.036, -0.0205, zt), (px - 0.038, 0.0, zt), (px - 0.036, 0.0205, zt), (px, 0.0215, zt + 0.0022)], 0.00095)
    sh.assign(hammer, wire)
    axle = sp.tube("Axle", [(px, -0.021, T + 0.0034), (px, 0.021, T + 0.0034)], 0.0008)
    sh.assign(axle, wire)
    bar = sp.tube("HoldDown", [(-0.044, 0.0, T + 0.0012), (-0.03, 0.0, zt + 0.0022), (0.0, 0.0, zt + 0.0026), (0.024, 0.0, T + 0.0042)], 0.0007)
    sh.assign(bar, wire)
    objs += [hammer, axle, bar]
    for sx in (-0.045, 0.026, px - 0.012):
        st = sp.tube(f"Staple{sx}", [(sx, -0.003, T - 0.001), (sx, -0.003, T + 0.0016), (sx, 0.003, T + 0.0016), (sx, 0.003, T - 0.001)], 0.0006)
        sh.assign(st, wire)
        objs.append(st)
    pedal = sp.box("Pedal", (0.017, 0.013, 0.0007), bevel=0.0002, segments=1)
    pedal.location = (0.031, 0.0, T + 0.0028)
    sh.assign(pedal, tin)
    objs.append(pedal)
    tri = [(0.0, -0.0065), (0.012, 0.0), (0.0, 0.0065)]
    ch = sp.loft("Cheese", [np.array([(x, y, 0.0) for x, y in tri]), np.array([(x, y, 0.008) for x, y in tri])], cap_bottom=True, cap_top=True)
    bm = bmesh.new()
    bm.from_mesh(ch.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.0008, segments=2, affect="EDGES")
    bm.to_mesh(ch.data)
    bm.free()
    ch.location = (0.025, 0.0, T + 0.0032)
    ch.rotation_euler = (0.0, 0.0, math.radians(10))
    sh.assign(ch, sh.cheese("Cheese"))
    objs.append(ch)
    return objs


# ------------------------------------------------------------------------------------------ book

def book(b: dict, label_id: str, seed: int = 1) -> list:
    """A hardcover book lying flat: cloth boards (the front printed), a rounded spine, the page block and a ribbon."""
    w, h, t = _m(b["w"]), _m(b["h"]), _m(b["t"])
    bt = 0.0026
    ow, oh = w + 0.003, h + 0.006
    cloth = sh.cloth("BookCloth", "#1c4d5c", 0.7, 0.35)
    back = sp.box("BackBoard", (ow, oh, bt), bevel=0.0007, segments=2)
    sh.assign(back, cloth)
    front = sp.box("FrontBoard", (ow, oh, bt), bevel=0.0007, segments=2)
    front.data.materials.append(cloth)
    front.data.materials.append(sh.label("L_" + label_id, label_id, extension="CLIP", print_bump=0.02))
    for p in front.data.polygons:
        if p.normal.z > 0.9:
            p.material_index = 1
    front.location.z = t - bt
    pages = sp.box("Pages", (w - 0.002, h, t - 2 * bt), bevel=0.0004, segments=1)
    pages.location = (0.0015, 0.0, bt)
    sh.assign(pages, sh.page_edges("Pages"))
    r = t / 2
    spine = sp.sheet("Spine", 0.0001, oh, 24, 4, lambda u, v: (-r * math.cos(math.pi * (u - 0.5)), 0.0, r * math.sin(math.pi * (u - 0.5)) + r))
    sp.solidify(spine, bt * 0.8, offset=1.0)
    spine.location.x = -ow / 2 + 0.001
    sh.assign(spine, cloth)

    def ribbon_fn(u, v):
        drop = min(1.0, v / 0.45)
        return ((u - 0.5) * 0.005, -v * 0.05, t * 0.45 * (1 - drop * drop * (3 - 2 * drop)) + 0.0003)
    ribbon = sp.sheet("Ribbon", 0.005, 0.05, 2, 30, ribbon_fn, absolute=True)
    ribbon.location = (-w * 0.2, -h / 2, 0.0)
    sh.assign(ribbon, sh.cloth("Ribbon", "#a3202a", 0.45, 0.6))
    return [back, front, pages, spine, ribbon]
