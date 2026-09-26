"""Mesh builders for the icon subjects: profile sweeps (cans, jars, cups, bottles, dishes), sheets, tubes, boxes.

Units are metres, Z up, origins at the floor contact point. Every mesh gets a metre UV map `UVMap` (for the
material library, whose textures repeat every `sizeM`) and, where a label can go, a `label` UV map that spans the
printable band 0..1.
"""

from __future__ import annotations

import math

import bmesh
import bpy
import numpy as np


# ------------------------------------------------------------------------------------------ outlines

def rounded_rect(w: float, d: float, r: float, n: int = 160):
    """A closed rounded rectangle centred at the origin, sampled evenly by arc length, counter-clockwise from the
    middle of the front (-Y) side. Returns (points (n, 2), outward normals (n, 2), arc length at each point, perimeter).
    A circle is a rounded rectangle with w = d = 2r."""
    r = min(r, w / 2, d / 2)
    hx, hy = w / 2 - r, d / 2 - r
    # segments: front half, corner, right, corner, back, corner, left, corner, front half
    segs = [
        ("line", (0.0, -d / 2), (hx, -d / 2), (0.0, -1.0)),
        ("arc", (hx, -hy), -math.pi / 2, 0.0),
        ("line", (w / 2, -hy), (w / 2, hy), (1.0, 0.0)),
        ("arc", (hx, hy), 0.0, math.pi / 2),
        ("line", (hx, d / 2), (-hx, d / 2), (0.0, 1.0)),
        ("arc", (-hx, hy), math.pi / 2, math.pi),
        ("line", (-w / 2, hy), (-w / 2, -hy), (-1.0, 0.0)),
        ("arc", (-hx, -hy), math.pi, 1.5 * math.pi),
        ("line", (-hx, -d / 2), (0.0, -d / 2), (0.0, -1.0)),
    ]
    lengths = []
    for s in segs:
        if s[0] == "line":
            lengths.append(math.dist(s[1], s[2]))
        else:
            lengths.append(r * (s[3] - s[2]))
    per = sum(lengths)
    pts, nrm, arc = [], [], []
    for i in range(n):
        t = per * i / n
        acc = 0.0
        for s, ln in zip(segs, lengths):
            if t <= acc + ln or s is segs[-1]:
                f = (t - acc) / ln if ln > 0 else 0.0
                if s[0] == "line":
                    (x0, y0), (x1, y1), nn = s[1], s[2], s[3]
                    pts.append((x0 + (x1 - x0) * f, y0 + (y1 - y0) * f))
                    nrm.append(nn)
                else:
                    (cx, cy), a0, a1 = s[1], s[2], s[3]
                    a = a0 + (a1 - a0) * f
                    pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
                    nrm.append((math.cos(a), math.sin(a)))
                break
            acc += ln
        arc.append(t)
    return np.array(pts), np.array(nrm), np.array(arc), per


def circle(r: float, n: int = 128):
    return rounded_rect(2 * r, 2 * r, r, n)


def outline(points) -> tuple:
    """The (points, outward normals, arc length, perimeter) tuple of any closed counter-clockwise polygon."""
    p = np.asarray(points, dtype=np.float64)
    nxt, prv = np.roll(p, -1, axis=0), np.roll(p, 1, axis=0)
    tan = nxt - prv
    tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([tan[:, 1], -tan[:, 0]], axis=1)
    seg = np.linalg.norm(nxt - p, axis=1)
    arc = np.concatenate([[0.0], np.cumsum(seg)[:-1]])
    return p, nrm, arc, float(seg.sum())


def knurled(r: float, depth: float, ridges: int, n: int = 480) -> tuple:
    """A circle with rounded ridges (a bottle cap's grip)."""
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n - math.pi / 2
        rr = r + depth * (0.5 + 0.5 * math.tanh(3.0 * math.cos(ridges * a)))
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return outline(pts)


# ------------------------------------------------------------------------------------------ mesh objects

def _finish(name: str, bm: bmesh.types.BMesh, smooth: bool = True, sharp_deg: float | None = 40.0) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
        if sharp_deg is not None:
            me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def sweep(name: str, outline, profile: list[tuple[float, float]], cap_bottom: bool = False, cap_top: bool = False,
          label_z: tuple[float, float] | None = None, label_u0: float = 0.0, smooth: bool = True,
          sharp_deg: float | None = 40.0, flip: bool = False) -> bpy.types.Object:
    """Sweeps a profile of (outward offset, z) points along a closed outline (see rounded_rect). The label UV runs
    u = arc length / perimeter (shifted by label_u0) around and v = (z - z0) / (z1 - z0) up the band label_z."""
    pts, nrm, arc, per = outline
    n = len(pts)
    bm = bmesh.new()
    uvm = bm.loops.layers.uv.new("UVMap")
    uvl = bm.loops.layers.uv.new("label")
    rings = []
    vlen = [0.0]
    for k in range(1, len(profile)):
        vlen.append(vlen[-1] + math.dist(profile[k - 1], profile[k]))
    for off, z in profile:
        ring = [bm.verts.new((pts[i, 0] + off * nrm[i, 0], pts[i, 1] + off * nrm[i, 1], z)) for i in range(n)]
        rings.append(ring)
    z0, z1 = label_z if label_z else (profile[0][1], profile[-1][1])
    for k in range(len(profile) - 1):
        for i in range(n):
            j = (i + 1) % n
            quad = [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]]
            if flip:
                quad.reverse()
            f = bm.faces.new(quad)
            for loop in f.loops:
                v = loop.vert
                col = (i if v in (rings[k][i], rings[k + 1][i]) else i + 1)
                kk = k if v in (rings[k][i], rings[k][j]) else k + 1
                s = arc[col] if col < n else per
                loop[uvm].uv = (s, vlen[kk])
                loop[uvl].uv = ((s / per + label_u0), (profile[kk][1] - z0) / (z1 - z0) if z1 != z0 else 0.0)
    for cap, ring, z, up in ((cap_bottom, rings[0], profile[0][1], False), (cap_top, rings[-1], profile[-1][1], True)):
        if not cap:
            continue
        centre = bm.verts.new((0.0, 0.0, z))
        for i in range(n):
            j = (i + 1) % n
            tri = [ring[i], ring[j], centre] if (up != flip) else [ring[j], ring[i], centre]
            f = bm.faces.new(tri)
            for loop in f.loops:
                co = loop.vert.co
                loop[uvm].uv = (co.x, co.y)
                loop[uvl].uv = (0.5 + co.x, 0.5 + co.y)
    bm.normal_update()
    return _finish(name, bm, smooth, sharp_deg)


def loft(name: str, sections: list, cap_bottom: bool = False, cap_top: bool = False, label_uv=None,
         smooth: bool = True, closed: bool = True) -> bpy.types.Object:
    """Skins rings of vertices (each an (n, 3) array, same n, bottom to top). The metre UV runs around by arc length
    and up by height; label_uv(x, y, z) -> (u, v) gives the label UV per vertex (planar projections for patches).
    closed=False leaves the rings open (a strip from the first to the last vertex)."""
    n = len(sections[0])
    bm = bmesh.new()
    uvm = bm.loops.layers.uv.new("UVMap")
    uvl = bm.loops.layers.uv.new("label")
    rings = [[bm.verts.new(tuple(p)) for p in sec] for sec in sections]
    arcs = []
    for sec in sections:
        d = np.linalg.norm(np.diff(np.vstack([sec, sec[:1]]), axis=0), axis=1)
        arcs.append(np.concatenate([[0.0], np.cumsum(d)]))
    cols = n if closed else n - 1
    for k in range(len(sections) - 1):
        for i in range(cols):
            j = (i + 1) % n
            f = bm.faces.new([rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]])
            for loop, (kk, ii) in zip(f.loops, ((k, i), (k, i + 1), (k + 1, i + 1), (k + 1, i))):
                v = loop.vert.co
                loop[uvm].uv = (arcs[kk][ii], v.z)
                loop[uvl].uv = label_uv(v.x, v.y, v.z) if label_uv else (ii / n, kk / (len(sections) - 1))
    for cap, ring, up in ((cap_bottom, rings[0], False), (cap_top, rings[-1], True)):
        if not cap:
            continue
        c = np.mean([tuple(v.co) for v in ring], axis=0)
        centre = bm.verts.new(tuple(c))
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new([ring[i], ring[j], centre] if up else [ring[j], ring[i], centre])
            for loop in f.loops:
                v = loop.vert.co
                loop[uvm].uv = (v.x, v.y)
                loop[uvl].uv = label_uv(v.x, v.y, v.z) if label_uv else (0.5, 0.5)
    bm.normal_update()
    return _finish(name, bm, smooth, None)


def polar_disc(name: str, radius_fn, rings: int = 24, segments: int = 128, z: float = 0.0, uv_d: float = 1.0) -> bpy.types.Object:
    """A flat disc whose rim follows radius_fn(theta), as rings x segments quads around a centre fan; the label UV
    maps a uv_d square centred on the origin to 0..1; a point attribute 'edge' holds the normalised radius."""
    bm = bmesh.new()
    uvm = bm.loops.layers.uv.new("UVMap")
    uvl = bm.loops.layers.uv.new("label")
    edge = bm.verts.layers.float.new("edge")
    centre = bm.verts.new((0.0, 0.0, z))
    centre[edge] = 0.0
    grid = []
    for k in range(1, rings + 1):
        f = k / rings
        row = []
        for i in range(segments):
            a = 2 * math.pi * i / segments - math.pi / 2
            r = radius_fn(a) * f
            v = bm.verts.new((r * math.cos(a), r * math.sin(a), z))
            v[edge] = f
            row.append(v)
        grid.append(row)
    faces = []
    for i in range(segments):
        faces.append(bm.faces.new([centre, grid[0][i], grid[0][(i + 1) % segments]]))
    for k in range(rings - 1):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append(bm.faces.new([grid[k][i], grid[k + 1][i], grid[k + 1][j], grid[k][j]]))
    for f in faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uvm].uv = (co.x, co.y)
            loop[uvl].uv = (0.5 + co.x / uv_d, 0.5 + co.y / uv_d)
    bm.normal_update()
    ob = _finish(name, bm, True, None)
    return ob


def displace(ob: bpy.types.Object, fn) -> bpy.types.Object:
    """Moves every vertex: fn(x, y, z, attrs) -> (x, y, z); attrs holds point float attributes by name."""
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    attrs = {}
    for a in me.attributes:
        if a.domain == "POINT" and a.data_type == "FLOAT":
            vals = np.empty(n)
            a.data.foreach_get("value", vals)
            attrs[a.name] = vals
    out = np.array([fn(co[i, 0], co[i, 1], co[i, 2], {k: v[i] for k, v in attrs.items()}) for i in range(n)])
    me.vertices.foreach_set("co", out.reshape(-1))
    me.update()
    return ob


def disc(name: str, outline, z: float, up: bool = True, uv_size: tuple[float, float] | None = None) -> bpy.types.Object:
    """A flat cap filling an outline at height z; the label UV maps the outline's bounding box to 0..1."""
    pts, _, _, _ = outline
    n = len(pts)
    bm = bmesh.new()
    uvm = bm.loops.layers.uv.new("UVMap")
    uvl = bm.loops.layers.uv.new("label")
    ring = [bm.verts.new((p[0], p[1], z)) for p in pts]
    centre = bm.verts.new((0.0, 0.0, z))
    w = uv_size[0] if uv_size else (pts[:, 0].max() - pts[:, 0].min())
    d = uv_size[1] if uv_size else (pts[:, 1].max() - pts[:, 1].min())
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new([ring[i], ring[j], centre] if up else [ring[j], ring[i], centre])
        for loop in f.loops:
            co = loop.vert.co
            loop[uvm].uv = (co.x, co.y)
            loop[uvl].uv = (0.5 + co.x / w, 0.5 + co.y / d)
    bm.normal_update()
    return _finish(name, bm, True, None)


def sheet(name: str, w: float, h: float, nx: int, ny: int, fn=None, smooth: bool = True, absolute: bool = False) -> bpy.types.Object:
    """A grid in the XY plane (x across w, y across h, centred), displaced by fn(u, v) -> (dx, dy, dz) with u, v in
    0..1 (absolute=True: fn gives the position itself). The label UV is (u, v); the metre UV is the undeformed
    position."""
    bm = bmesh.new()
    uvm = bm.loops.layers.uv.new("UVMap")
    uvl = bm.loops.layers.uv.new("label")
    verts = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, y, z = (u - 0.5) * w, (v - 0.5) * h, 0.0
            if fn and absolute:
                x, y, z = fn(u, v)
            elif fn:
                dx, dy, dz = fn(u, v)
                x, y, z = x + dx, y + dy, z + dz
            row.append(bm.verts.new((x, y, z)))
        verts.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new([verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]])
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uvl].uv = (a / nx, b / ny)
                loop[uvm].uv = ((a / nx - 0.5) * w, (b / ny - 0.5) * h)
    bm.normal_update()
    return _finish(name, bm, smooth, None)


def box(name: str, size: tuple[float, float, float], bevel: float = 0.0, segments: int = 3, centre_z: bool = False) -> bpy.types.Object:
    """An axis-aligned box standing on z = 0 (or centred), with world-planar metre UVs and a `label` UV that maps each
    face's own extent to 0..1."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if not centre_z:
        bmesh.ops.translate(bm, vec=(0.0, 0.0, sz / 2), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    uvm = bm.loops.layers.uv.new("UVMap")
    uvl = bm.loops.layers.uv.new("label")
    zoff = 0.0 if centre_z else sz / 2
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 0:
                u, v, su, sv = co.y * (1 if n.x > 0 else -1), co.z - zoff, sy, sz
            elif ax == 1:
                u, v, su, sv = co.x * (-1 if n.y > 0 else 1), co.z - zoff, sx, sz
            else:
                u, v, su, sv = co.x, co.y * (1 if n.z > 0 else -1), sx, sy
            loop[uvm].uv = (u, v)
            loop[uvl].uv = (0.5 + u / su, 0.5 + v / sv)
    bm.normal_update()
    return _finish(name, bm, True, 35.0)


def tube(name: str, points: list[tuple[float, float, float]], radius: float, cyclic: bool = False,
         resolution: int = 6, bevel_res: int = 4) -> bpy.types.Object:
    """A round wire along a poly-Bezier through the points (auto handles), converted to a mesh."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = resolution
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    sp.use_cyclic_u = cyclic
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    return to_mesh(ob)


def helix(name: str, radius: float, pitch: float, turns: float, wire: float, axis: str = "X", steps_per_turn: int = 24) -> bpy.types.Object:
    pts = []
    n = max(2, int(turns * steps_per_turn))
    for i in range(n + 1):
        a = 2 * math.pi * turns * i / n
        s = pitch * turns * i / n - pitch * turns / 2
        c, d = radius * math.cos(a), radius * math.sin(a)
        pts.append((s, c, d) if axis == "X" else (c, d, s))
    return tube(name, pts, wire, resolution=2, bevel_res=3)


def to_mesh(ob: bpy.types.Object) -> bpy.types.Object:
    """Replaces a curve (or any object with modifiers) by a plain mesh object with the same name."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    name = ob.name
    mw = ob.matrix_world.copy()
    data = ob.data
    bpy.data.objects.remove(ob)
    if isinstance(data, bpy.types.Curve):
        bpy.data.curves.remove(data)
    new = bpy.data.objects.new(name, me)
    new.matrix_world = mw
    bpy.context.scene.collection.objects.link(new)
    for p in me.polygons:
        p.use_smooth = True
    return new


def apply_modifiers(ob: bpy.types.Object) -> bpy.types.Object:
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def subdivide(ob: bpy.types.Object, levels: int = 2, apply: bool = False) -> bpy.types.Object:
    m = ob.modifiers.new("Subsurf", "SUBSURF")
    m.levels = m.render_levels = levels
    m.uv_smooth = "PRESERVE_CORNERS"
    return apply_modifiers(ob) if apply else ob


def solidify(ob: bpy.types.Object, thickness: float, offset: float = -1.0, apply: bool = False) -> bpy.types.Object:
    m = ob.modifiers.new("Solidify", "SOLIDIFY")
    m.thickness = thickness
    m.offset = offset
    m.use_even_offset = True
    m.use_quality_normals = True
    return apply_modifiers(ob) if apply else ob


def transform(ob: bpy.types.Object, loc=(0.0, 0.0, 0.0), rot_deg=(0.0, 0.0, 0.0), scale=None) -> bpy.types.Object:
    ob.location = loc
    ob.rotation_euler = tuple(math.radians(a) for a in rot_deg)
    if scale is not None:
        ob.scale = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    return ob


def parent_all(objs: list, name: str = "Subject") -> bpy.types.Object:
    """Parents the objects to one empty so the subject can be posed as a whole."""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for ob in objs:
        ob.parent = root
    return root


def rest_on_floor(objs: list, root: bpy.types.Object) -> None:
    """Moves the posed subject so its lowest point touches z = 0."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    zmin = math.inf
    for ob in objs:
        if ob.type != "MESH":
            continue
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        n = len(me.vertices)
        if n:
            co = np.empty(n * 3)
            me.vertices.foreach_get("co", co)
            co = co.reshape(n, 3)
            m = np.array(ev.matrix_world)
            zmin = min(zmin, float((co @ m[:3, :3].T + m[:3, 3])[:, 2].min()))
        ev.to_mesh_clear()
    root.location.z -= zmin
    bpy.context.view_layer.update()
