"""Scene setup: an empty metric scene and small mesh builders."""

from __future__ import annotations

import bmesh
import bpy


def reset() -> bpy.types.Scene:
    """Empties the startup file and sets metric units (1 unit = 1 m)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.unit_settings.length_unit = "METERS"
    return sc


def collection(name: str) -> bpy.types.Collection:
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def link(obj: bpy.types.Object, col: bpy.types.Collection | None = None) -> bpy.types.Object:
    (col or bpy.context.scene.collection).objects.link(obj)
    return obj


def mesh_object(name: str, bm: bmesh.types.BMesh, smooth: bool = False) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    return link(bpy.data.objects.new(name, me))


def uv_sphere(name: str, radius: float, segments: int = 96, rings: int = 48) -> bpy.types.Object:
    """Sphere resting on z = 0 with UVs in meters (u along the equator, v pole to pole)."""
    import math

    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius, calc_uvs=True)
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (loop[uv].uv.x * 2 * math.pi * radius, loop[uv].uv.y * math.pi * radius)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0.0, 0.0, radius))
    return mesh_object(name, bm, smooth=True)


def box(name: str, size: tuple[float, float, float], bevel: float = 0.0) -> bpy.types.Object:
    """Axis-aligned box standing on z = 0, centered in x/y; UVs are world-planar per face in meters."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0.0, 0.0, sz / 2), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=3, affect="EDGES", profile=0.5)
    planar_uvs(bm)
    return mesh_object(name, bm)


def planar_uvs(bm: bmesh.types.BMesh) -> None:
    """Box-projected UVs in meters: each face projects along its dominant normal axis."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 0:
                loop[uv].uv = (co.y * (1 if n.x > 0 else -1), co.z)
            elif ax == 1:
                loop[uv].uv = (co.x * (-1 if n.y > 0 else 1), co.z)
            else:
                loop[uv].uv = (co.x, co.y)


def plane(name: str, size: tuple[float, float], z: float = 0.0) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(size[0], size[1], 1.0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0.0, 0.0, z), verts=bm.verts)
    planar_uvs(bm)
    return mesh_object(name, bm)
