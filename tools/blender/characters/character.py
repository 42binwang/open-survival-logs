"""Stage 'character': the character recipe (e.g. wage.json) -> a game-ready skinned mesh with baked texture atlases.

    BLENDER_USER_RESOURCES=.work/blender_user Blender --background --factory-startup --python character.py -- wage.json

1. MPFB builds the human from CC0 system assets: phenotype, game_engine rig and weights, eyes, brows, lashes, hair,
   clothes fitted to the body; body faces under the clothes are deleted.
2. The rest pose is lowered from MPFB's A-pose (arms about 49 degrees down) to arms about 67 degrees down, with a
   corrective smooth over the shoulders, so hanging and swinging arms deform the top less.
3. Garment regions come from the recipe's rules (source-UV boxes: the top's panels and sleeves vs the jeans; the
   shoes' tread, lining and sock; the sole sidewall by height); the hood (down, at the nape) and the drawstrings are generated on the top.
4. Every part is decimated to its triangle budget, gets an atlas UV at the recipe's texel density (512 px/m, the
   ART.md hero class) per material group (skin, cloth, hair) and is baked in Cycles (base color, normal, roughness,
   occlusion, alpha, region ids). Each region's baked albedo is then calibrated to its recipe target (mean linear
   luminance, ART.md §7.2) and clamped to ART.md's hard limits.
5. Weights are limited to 4 influences and normalized; the parts are joined into one mesh with three materials.

Writes .work/<id>/character.blend and .work/<id>/bake/*.png; prints one line 'SUMMARY {json}'.
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import pipeline as common  # noqa: E402

HEAD_Z = 1.5  # height of the rig's head joint (top of the neck), measured after the human is built
ALBEDO_MIN, ALBEDO_MAX = 0.013, 0.90  # ART.md §7.2 hard limits for diffuse albedo (linear)

# ----------------------------------------------------------------------------------------------------------- utils


def log(*a):
    print("[character]", *a, flush=True)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def activate(obj, others=()):
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in (obj, *others):
        o.select_set(True)
    bpy.context.view_layer.objects.active = obj


def load_image(path, colorspace="sRGB"):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def image_array(img):
    """RGBA float array (h, w, 4) of an image, row 0 at the bottom (Blender order)."""
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def sample(arr, u, v):
    h, w = arr.shape[:2]
    x = min(w - 1, max(0, int((u % 1.0) * w)))
    y = min(h - 1, max(0, int((v % 1.0) * h)))
    return arr[y, x]


def mpfb_asset(rel, subdir):
    from bl_ext.user_default.mpfb.services.assetservice import AssetService  # noqa: PLC0415

    path = AssetService.find_asset_absolute_path(rel, subdir)
    if not path:
        raise FileNotFoundError(f"MPFB asset {subdir}/{rel} not found (asset packs unpacked by build.py setup?)")
    return path


def mhmat_textures(path):
    """Texture entries of a MakeHuman .mhmat, as absolute paths."""
    out = {}
    base = os.path.dirname(path)
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 2 and parts[0].endswith("Texture"):
                p = os.path.join(base, parts[1])
                if os.path.exists(p):
                    out[parts[0]] = p
    return out


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb8(rgb):
    """Recipe colors are sRGB 0-255; shader values are linear."""
    return tuple(float(x) for x in to_linear(np.asarray(rgb[:3], dtype=np.float64) / 255.0))


def linear_rgb(img):
    """Linear RGB pixels (h, w, 3): 8-bit sRGB images hold encoded values, float images (16-bit PNG, EXR) are
    already scene-linear, Non-Color data is returned as stored."""
    arr = image_array(img)[..., :3]
    if img.is_float or img.colorspace_settings.name != "sRGB":
        return arr.astype(np.float64)
    return to_linear(arr)


def image_mean_lum(path, colorspace="sRGB"):
    return float(lum(linear_rgb(load_image(path, colorspace)).reshape(-1, 3).mean(axis=0)))


def source_file(ref):
    """'<lock source id>:<member path>' -> absolute path of the unpacked or downloaded file in assets/cache."""
    sid, member = ref.split(":", 1)
    path = common.cache(sid, member)
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path} missing: run build.py setup")
    return path


# ------------------------------------------------------------------------------------------------------ 1. human
def build_human(recipe):
    from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: PLC0415

    spec = recipe["mpfb"]
    info = {
        "name": recipe["id"],
        "phenotype": spec["phenotype"],
        "rig": spec["rig"],
        "eyes": spec["eyes"],
        "eyebrows": spec["eyebrows"],
        "eyelashes": spec["eyelashes"],
        "hair": spec["hair"],
        "tongue": "",
        "teeth": "",
        "proxy": "",
        "targets": [],
        "clothes": spec["clothes"],
        "skin_mhmat": spec["skin_mhmat"],
        "skin_material_type": "NONE",
        "eyes_material_type": "NONE",
        "skin_material_settings": {},
        "eyes_material_settings": {},
        "expressions": [],
        "alternative_materials": spec.get("alternative_materials", {}),
    }
    settings = HumanService.get_default_deserialization_settings()
    settings.update(subdiv_levels=0, override_clothes_model="NONE", override_eyes_model="NONE")
    basemesh = HumanService.deserialize_from_dict(info, settings)
    rig = basemesh.parent
    assert rig and rig.type == "ARMATURE", "MPFB did not add the rig"
    parts = {"body": basemesh}
    for o in rig.children:
        if o is not basemesh and o.type == "MESH":
            parts[o.name.split(".", 1)[1]] = o
    return rig, parts


def bake_body(body):
    """Freezes the phenotype shape keys and deletes the helpers and every body face that a garment covers."""
    activate(body)
    if body.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    groups = {g.index: g.name for g in body.vertex_groups}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    deform = bm.verts.layers.deform.active
    doomed = []
    for v in bm.verts:
        names = {groups[i] for i, w in v[deform].items() if w > 0.5}
        if "body" not in names or any(n.startswith("Delete.") for n in names):
            doomed.append(v)
    bmesh.ops.delete(bm, geom=doomed, context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    for m in list(body.modifiers):
        if m.type == "MASK":
            body.modifiers.remove(m)
    log("body after deleting covered faces:", len(body.data.vertices), "verts", tri_count(body), "tris")


# ------------------------------------------------------------------------------------------- 2. garment regions


def encoded_array(img):
    """RGBA pixels as sRGB-encoded values whatever the storage (float images hold linear values)."""
    arr = image_array(img)
    if img.is_float:
        rgb = np.clip(arr[..., :3], 0.0, 1.0)
        arr = arr.copy()
        arr[..., :3] = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1 / 2.4) - 0.055)
    return arr


def face_colors(obj, image_path):
    """Median source-texture color (sRGB-encoded) under each face and the face's UV centroid."""
    arr = encoded_array(load_image(image_path))
    uv = obj.data.uv_layers["UVMap"].data
    out = []
    for p in obj.data.polygons:
        cols = [sample(arr, *uv[li].uv) for li in p.loop_indices]
        cu = sum(uv[li].uv.x for li in p.loop_indices) / p.loop_total
        cv = sum(uv[li].uv.y for li in p.loop_indices) / p.loop_total
        cols.append(sample(arr, cu, cv))
        out.append((np.median(np.array(cols)[:, :3], axis=0), cu, cv))
    return out


def set_slots(obj, mats):
    """Replaces the material slots in place (Mesh.materials.clear() would reset every face's material index)."""
    slots = obj.data.materials
    for i, m in enumerate(mats):
        if i < len(slots):
            slots[i] = m
        else:
            slots.append(m)
    while len(slots) > len(mats):
        slots.pop()


def assign_regions(obj, regions, order):
    """Deletes 'hidden' faces, creates one source material slot per region and assigns the faces."""
    set_slots(obj, [bpy.data.materials.get(f"src.{n}") or bpy.data.materials.new(f"src.{n}") for n in order])
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    idx = {n: i for i, n in enumerate(order)}
    doomed = []
    for f, r in zip(bm.faces, regions):
        if r == "hidden":
            doomed.append(f)
        else:
            f.material_index = idx[r]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    counts = {n: sum(1 for r in regions if r == n) for n in order + ["hidden"]}
    log(obj.name, "regions:", counts)


# ---------------------------------------------------------------------------------------------------- 2b. surfaces


def surface_front(bvh, x, z, y0=-1.0):
    """First hit of a ray from the front (-Y) toward +Y at (x, z): (point, normal) or None."""
    hit = bvh.ray_cast(Vector((x, y0, z)), Vector((0, 1, 0)), 2.0)
    return (hit[0], hit[1]) if hit[0] is not None else None




# ------------------------------------------------------------------------------------------ 2. lower rest pose


def lower_arms_rest(rig, meshes, spec):
    """Rebinds the character with the arms lower than MPFB's A-pose: the arms are posed down, the meshes take that
    pose (a corrective smooth relaxes the shoulders, where linear blend skinning folds the top into a corner) and the
    pose becomes the rest pose. Returns the new upper-arm angle below the horizontal."""
    heads0 = [rig.data.bones[f"upperarm_{s}"].head_local.copy() for s in "lr"]
    activate(rig)
    bpy.ops.object.mode_set(mode="POSE")
    for side, sgn in (("l", 1.0), ("r", -1.0)):
        for bone, ang in ((f"clavicle_{side}", spec.get("clavicleDropDeg", 0.0)), (f"upperarm_{side}", spec["armDropDeg"] - spec.get("clavicleDropDeg", 0.0))):
            pb = rig.pose.bones[bone]
            head = pb.head.copy()
            pb.matrix = Matrix.Translation(head) @ Matrix.Rotation(sgn * math.radians(ang), 4, "Y") @ Matrix.Translation(-head) @ pb.matrix
            bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    r0, r1 = spec["smoothRadius"]
    for o in meshes:
        g = o.vertex_groups.new(name="cs_zone")
        for v in o.data.vertices:
            d = min((v.co - h).length for h in heads0)
            w = max(0.0, min(1.0, (r1 - d) / (r1 - r0)))
            if w > 0 and abs(v.co.x) > spec.get("neckClearX", 0.09):
                g.add([v.index], w * w * (3 - 2 * w), "REPLACE")
        cs = o.modifiers.new("cs", "CORRECTIVE_SMOOTH")
        cs.rest_source = "ORCO"
        cs.factor = spec["smoothFactor"]
        cs.iterations = spec["smoothIterations"]
        cs.smooth_type = "LENGTH_WEIGHTED"
        cs.vertex_group = "cs_zone"
        activate(o)
        arm = next(m for m in o.modifiers if m.type == "ARMATURE")
        while o.modifiers[0] != arm:
            bpy.ops.object.modifier_move_up(modifier=arm.name)
        bpy.ops.object.modifier_apply(modifier=arm.name)
        bpy.ops.object.modifier_apply(modifier=cs.name)
        o.vertex_groups.remove(o.vertex_groups["cs_zone"])
        a = o.modifiers.new("Armature", "ARMATURE")
        a.object = rig
    activate(rig)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    b = rig.data.bones["upperarm_l"]
    d = b.tail_local - b.head_local
    return math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y)))


# ------------------------------------------------------------------------------------------- 3. garment regions


def classify_uv_boxes(obj, boxes, default, low_band=None):
    """Regions by source-UV rectangles ([region, [u0, u1], [v0, v1]], first match wins); `low_band` ([region, dz])
    takes every face whose centre is within dz of the garment's lowest point (a shoe's sole sidewall)."""
    uv = obj.data.uv_layers["UVMap"].data
    floor = min(v.co.z for v in obj.data.vertices)
    out = []
    for p in obj.data.polygons:
        cu = sum(uv[li].uv.x for li in p.loop_indices) / p.loop_total
        cv = sum(uv[li].uv.y for li in p.loop_indices) / p.loop_total
        r = default
        for name, (u0, u1), (v0, v1) in boxes:
            if u0 <= cu <= u1 and v0 <= cv <= v1:
                r = name
                break
        if low_band and p.center.z < floor + low_band[1]:
            r = low_band[0]
        out.append(r)
    return out


def classify_garment(obj, g, diffuse):
    """A garment's face regions: the UV boxes (above), or `palette` ({region: sRGB 0-255}: each face takes the region
    whose colour is nearest the source texture's median colour under it, for garments whose pieces differ in colour,
    e.g. a jacket, the shirt under it and jeans), then `rules` ([{from, to, absXAbove | zBelow | zAbove}], positions in
    metres, heights as fractions of the head joint's height): a jacket's sleeves apart from its body, for instance."""
    if g.get("palette"):
        names = list(g["palette"])
        protos = np.array([g["palette"][n] for n in names], dtype=np.float64) / 255.0
        regions = []
        for med, _cu, _cv in face_colors(obj, diffuse):
            regions.append(names[int(np.argmin(((protos - med[None, :3]) ** 2).sum(axis=1)))])
        if g.get("lowBand"):
            floor = min(v.co.z for v in obj.data.vertices)
            regions = [g["lowBand"][0] if p.center.z < floor + g["lowBand"][1] else r for p, r in zip(obj.data.polygons, regions)]
    else:
        regions = classify_uv_boxes(obj, g.get("boxes", []), g["default"], g.get("lowBand"))
    names = {vg.index: vg.name for vg in obj.vertex_groups}

    def bone_share(p, prefixes):
        """Mean skin weight of a face's vertices on bones whose names start with one of `prefixes`."""
        tot = 0.0
        for vi in p.vertices:
            v = obj.data.vertices[vi]
            all_w = sum(e.weight for e in v.groups) or 1.0
            tot += sum(e.weight for e in v.groups if names.get(e.group, "").startswith(tuple(prefixes))) / all_w
        return tot / len(p.vertices)

    for rule in g.get("rules", []):
        for i, p in enumerate(obj.data.polygons):
            if regions[i] != rule["from"]:
                continue
            c = p.center
            if ("absXAbove" in rule and abs(c.x) > rule["absXAbove"]) or ("zBelow" in rule and c.z < rule["zBelow"] * HEAD_Z) \
                    or ("zAbove" in rule and c.z > rule["zAbove"] * HEAD_Z) \
                    or ("bones" in rule and bone_share(p, rule["bones"]) > rule.get("share", 0.5)):
                regions[i] = rule["to"]
    return regions


# ------------------------------------------------------------------------------------- 3b. hood and drawstrings


class Builder:
    """Accumulates generated geometry (vertices, faces, per-vertex UVs)."""

    def __init__(self):
        self.verts, self.faces, self.uvs = [], [], []

    def strip(self, rows, thickness, tile, u0):
        """rows (along the length): (centre, half width, unit side, unit back). A closed strip `thickness` deep toward
        `back`; front and back share UVs (u across, v along, in tiles of the fabric scan)."""
        base = len(self.verts)
        s = 0.0
        for i, (c, hw, side, back) in enumerate(rows):
            if i:
                s += (c - rows[i - 1][0]).length
            for sx in (-1, 1):
                p = c + side * (hw * sx)
                uv = (u0 + hw * sx / tile, 1.0 - s / tile)
                self.verts.extend((p, p + back * thickness))
                self.uvs.extend((uv, uv))
        for i in range(len(rows) - 1):
            a, b = base + i * 4, base + (i + 1) * 4
            self.faces.extend(((a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1), (a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3)))
        last = base + (len(rows) - 1) * 4
        self.faces.extend(((base, base + 2, base + 3, base + 1), (last, last + 1, last + 3, last + 2)))

    def grid(self, pts, uvs):
        """A surface from a (rows x cols) grid of points (None = hole) with per-point UVs."""
        idx = {}
        for (j, i), p in pts.items():
            idx[(j, i)] = len(self.verts)
            self.verts.append(p)
            self.uvs.append(uvs[(j, i)])
        for (j, i) in pts:
            quad = [(j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)]
            if all(q in idx for q in quad):
                self.faces.append(tuple(idx[q] for q in quad))

    def mesh(self, name):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        me.validate()
        me.update()
        uvl = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            poly.use_smooth = True
            for li in poly.loop_indices:
                uvl.data[li].uv = self.uvs[me.loops[li].vertex_index]
        return me


def make_hood(recipe, top, rig):
    """The hood, down: a rolled lip standing behind the neck and the hood's fabric lying on the upper back and over
    the shoulders, on the top's outer surface. Returns a Builder."""
    h = recipe["hood"]
    tile = recipe["materials"]["hoodie"]["scan"]["tileM"]
    bvh = BVHTree.FromObject(top, bpy.context.evaluated_depsgraph_get())
    neck = rig.data.bones["neck_01"].head_local
    span = math.radians(h["spanDeg"])

    def hit(theta, z):
        d = Vector((math.sin(theta), math.cos(theta), 0.0))  # theta 0 = straight back (+Y)
        r = bvh.ray_cast(Vector((0.0, neck.y, z)) + d * 0.35, -d, 0.6)
        return (r[0], r[1]) if r[0] is not None else None

    cols, rows = h["cols"], h["rows"]
    pts, uvs = {}, {}
    arc_u = [0.0] * (cols + 1)
    # the top's neckline per azimuth (the highest height where the ray still meets the top), smoothed along the hood:
    # the raw heights step between columns, and the lip built on them would show the steps as tabs
    raw = []
    for i in range(cols + 1):
        theta = -span + 2 * span * i / cols
        z = neck.z + 0.04
        while z > neck.z - 0.12 and hit(theta, z) is None:
            z -= 0.004
        raw.append(z)
    padded = [raw[0]] * 2 + raw + [raw[-1]] * 2
    smooth = [sum(padded[i:i + 5]) / 5 for i in range(cols + 1)]
    for i in range(cols + 1):
        theta = -span + 2 * span * i / cols
        top_z, neckline = smooth[i], raw[i]
        back = math.cos(theta / span * math.pi / 2)
        drop = h["sideDrop"] + (h["backDrop"] - h["sideDrop"]) * back ** 1.6
        lip = h["lipRise"] * (0.2 + 0.8 * back)
        prev = None
        last = None
        v_acc = 0.0
        for j in range(rows + 1):
            t = j / rows
            zz = top_z + lip * (1 - t) ** 3 - t * drop
            hh = hit(theta, min(zz, neckline))
            if hh is None:
                # a ray that misses the top (an armpit fold, the collar edge) would leave a hole in the sheet: carry
                # the column on from its previous point
                if last is None:
                    continue
                hh = (last[0] + Vector((0, 0, min(zz, top_z) - last[0].z)), last[1])
            last = hh
            p, n = hh
            thick = h["thickEdge"] + (h["thickMax"] - h["thickEdge"]) * math.sin(math.pi * min(1.0, 0.25 + 0.9 * t)) * (0.3 + 0.7 * back)
            if zz > neckline:
                # the lip stands above the collar: offset it outward horizontally (the rim's normals swing wildly)
                p = p + Vector((0, 0, zz - neckline))
                n = Vector((math.sin(theta), math.cos(theta), 0.0))
            q = p + n * thick
            if prev is not None:
                v_acc += (q - prev).length
            prev = q
            pts[(j, i)] = q
            if j == 0 and i > 0 and (0, i - 1) in pts:
                arc_u[i] = arc_u[i - 1] + (q - pts[(0, i - 1)]).length
            elif j == 0 and i > 0:
                arc_u[i] = arc_u[i - 1]
            uvs[(j, i)] = (arc_u[i] / tile, 1.0 - v_acc / tile)
    log(f"hood grid: {len(pts)} of {(rows + 1) * (cols + 1)} points")
    b = Builder()
    b.grid(pts, uvs)
    return b


def neck_follow(obj, rig, spec):
    """The hood's upper band follows the neck and head: weights blend toward neck_01 (followNeck) and head
    (followHead) with height (smoothstep from followBand[0] to followBand[1] metres relative to the neck joint), so
    the lip stays tucked under the skull when the trunk leans and the head stays upright (bound to the upper back, it
    stands up behind the head like a fin)."""
    fn, fh = spec.get("followNeck", 0.0), spec.get("followHead", 0.0)
    if not (fn or fh):
        return
    nz = rig.data.bones["neck_01"].head_local.z
    lo, hi = nz + spec["followBand"][0], nz + spec["followBand"][1]
    groups = {b: obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b) for b in ("neck_01", "head")}
    for v in obj.data.vertices:
        t = max(0.0, min(1.0, (v.co.z - lo) / (hi - lo)))
        s = t * t * (3 - 2 * t)
        if s <= 0:
            continue
        k = (fn + fh) * s
        old = {obj.vertex_groups[e.group].name: e.weight for e in v.groups}
        for e in v.groups:
            e.weight *= 1 - k
        for b, f in (("neck_01", fn), ("head", fh)):
            groups[b].add([v.index], old.get(b, 0.0) * (1 - k) + f * s, "REPLACE")


def make_drawstrings(recipe, top, rig, b):
    """Two cords hanging from the front of the neckline, on the top's front surface."""
    h = recipe["hood"]
    tile = recipe["materials"]["hoodie"]["scan"]["tileM"]
    bvh = BVHTree.FromObject(top, bpy.context.evaluated_depsgraph_get())
    neck = rig.data.bones["neck_01"].head_local
    for sx in (-1, 1):
        x0 = sx * h["stringX"]
        z = neck.z + 0.02
        while z > neck.z - 0.2 and surface_front(bvh, x0, z) is None:
            z -= 0.003
        rows = []
        n = 8
        for k in range(n + 1):
            f = k / n
            xx = x0 + sx * 0.006 * f
            zz = z - 0.012 - f * h["stringLength"]
            s = surface_front(bvh, xx, zz)
            if s is None:
                break
            c = s[0] + Vector((0, -h["stringGap"], 0))
            w = h["stringWidth"] * (1.6 if f > 0.9 else 1.0)  # the aglet
            rows.append((c, w / 2, Vector((1, 0, 0)), Vector((0, 1, 0))))
        if len(rows) > 2:
            b.strip(rows, h["stringThickness"], tile, 0.9)
    return b


def _nearest_hit(bvhs, origin, direction, dist):
    """The first hit of a ray over several surfaces: (point, normal) or None."""
    best = None
    for bvh in bvhs:
        r = bvh.ray_cast(origin, direction, dist)
        if r[0] is not None and (best is None or r[3] < best[2]):
            best = (r[0], r[1], r[3])
    return (best[0], best[1]) if best else None


def make_backpack(recipe, top, rig, extra=()):
    """A small backpack on the upper back: a rounded pillow (a superellipse dome over the top's back surface, its rim
    `gap` off the fabric) and two shoulder straps running from its top over the shoulders down the chest, laid on the
    outer surface of the top and of `extra` (the hood). Returns (pack Builder, straps Builder)."""
    bp = recipe["backpack"]
    tile = recipe["materials"][recipe["generated"]["backpack"]["region"]]["scan"]["tileM"]
    dg = bpy.context.evaluated_depsgraph_get()
    bvhs = [BVHTree.FromObject(o, dg) for o in (top, *extra)]
    top_bvh = bvhs[:1]
    neck = rig.data.bones["neck_01"].head_local
    z_top = neck.z - bp["topBelowNeck"]
    z_bot = z_top - bp["height"]
    hw = bp["width"] / 2
    cols, rows = bp["cols"], bp["rows"]
    pts, uvs = {}, {}
    for j in range(rows + 1):
        v = -1 + 2 * j / rows
        z = z_top + (z_bot - z_top) * j / rows
        for i in range(cols + 1):
            u = -1 + 2 * i / cols
            x = u * hw
            hit = _nearest_hit(top_bvh, Vector((x, neck.y + 0.6, z)), Vector((0, -1, 0)), 1.2)
            if hit is None:
                continue
            s = max(0.0, 1 - abs(u) ** 4) ** 0.5 * max(0.0, 1 - abs(v) ** 4) ** 0.5
            pts[(j, i)] = Vector((x, hit[0].y + bp["gap"] + bp["depth"] * s, z))
            uvs[(j, i)] = (0.1 + (u + 1) * hw / tile, 1.0 - (v + 1) * bp["height"] / 2 / tile)
    pack = Builder()
    pack.grid(pts, uvs)

    straps = Builder()
    cz = neck.z - 0.07
    for sx in (-1, 1):
        x = sx * bp["strapX"]
        path = []
        # up the back from the pack's top, over the shoulder (an arc in the YZ plane), down the chest
        for k in range(6):
            z = z_top + 0.02 + (cz - z_top - 0.02) * k / 6
            h = _nearest_hit(bvhs, Vector((x, neck.y + 0.6, z)), Vector((0, -1, 0)), 1.2)
            if h:
                path.append(h)
        for k in range(13):
            phi = math.pi * k / 12  # 0: straight back (+Y), pi/2: up, pi: front (-Y)
            d = Vector((0.0, math.cos(phi), math.sin(phi)))
            h = _nearest_hit(bvhs, Vector((x, neck.y, cz)) + d * 0.4, -d, 0.6)
            if h:
                path.append(h)
        for k in range(1, 7):
            z = cz - bp["strapFront"] * k / 6
            h = _nearest_hit(bvhs, Vector((x + sx * 0.012 * k / 6, neck.y - 0.6, z)), Vector((0, 1, 0)), 1.2)
            if h:
                path.append(h)
        rows_ = []
        for p, n in path:
            n = Vector((0.0, n.y, n.z)).normalized() if abs(n.x) < 0.95 else n
            c = p + n * (bp["strapGap"] + bp["strapThickness"])
            rows_.append((c, bp["strapWidth"] / 2, Vector((1, 0, 0)), -n))
        # drop points that fold back on the path (a ray that met the far side of the shoulder)
        clean = [rows_[0]]
        for r in rows_[1:]:
            if (r[0] - clean[-1][0]).length > 0.004:
                clean.append(r)
        straps.strip(clean, bp["strapThickness"], tile, 0.5)
    log(f"backpack grid: {len(pts)} points; straps built")
    return pack, straps


def bind_rigid(obj, weights):
    """Replaces every vertex's weights with fixed bone weights ({bone: w}): a rigid part (the backpack's body)."""
    for g in list(obj.vertex_groups):
        obj.vertex_groups.remove(g)
    idx = list(range(len(obj.data.vertices)))
    for b, w in weights.items():
        obj.vertex_groups.new(name=b).add(idx, w, "REPLACE")


def finish_generated(name, builder, source, rig, material, shell=0.0):
    """Links generated geometry, skins it like the garment under it and gives it its material slot. Open sheets get
    a `shell` thickness (a solidify, inward) so they read from both sides under back-face culling."""
    obj = bpy.data.objects.new(name, builder.mesh(name))
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = rig
    obj.data.materials.append(material)
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    closed = all(e.is_manifold for e in bm.edges)
    volume = bm.calc_volume(signed=True) if closed else 0.0
    bm.free()
    if closed:
        if volume < 0:
            me.flip_normals()
    else:
        axis_y = sum((v.co.y for v in source.data.vertices), 0.0) / max(len(source.data.vertices), 1)
        out = sum(((p.center - Vector((0.0, axis_y, p.center.z))).normalized().dot(p.normal) for p in me.polygons), 0.0)
        if out < 0:
            me.flip_normals()
    activate(obj)
    if shell > 0:
        sol = obj.modifiers.new("shell", "SOLIDIFY")
        sol.thickness = shell
        sol.offset = -1.0
        sol.use_rim = True
        sol.use_even_offset = True
        bpy.ops.object.modifier_apply(modifier=sol.name)
    for g in source.vertex_groups:
        obj.vertex_groups.new(name=g.name)
    dt = obj.modifiers.new("weights", "DATA_TRANSFER")
    dt.object = source
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    arm = obj.modifiers.new("Armature", "ARMATURE")
    arm.object = rig
    log(f"{name}: {len(me.vertices)} verts {tri_count(obj)} tris")
    return obj
def protect_group(obj, fn, name="protect"):
    """Vertex group of detail to keep: 1 = keep (the decimator's weights are inverted), 0 = free to collapse."""
    g = obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
    for v in obj.data.vertices:
        g.add([v.index], fn(v.co), "REPLACE")
    return g


def decimate(obj, target_tris, group=None, factor=1.0):
    """Collapse decimation (X-symmetric, UV-seam aware) to target_tris; `group` weights protect detail softly."""
    have = tri_count(obj)
    if have <= target_tris:
        return have
    activate(obj)
    ratio = target_tris / have
    for attempt in range(8):
        m = obj.modifiers.new("decimate", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = ratio
        m.use_collapse_triangulate = True
        m.use_symmetry = True
        m.symmetry_axis = "X"
        if group:
            m.vertex_group = group
            m.invert_vertex_group = True
            m.vertex_group_factor = factor
        while obj.modifiers[0] != m:
            bpy.ops.object.modifier_move_up(modifier=m.name)
        dg = bpy.context.evaluated_depsgraph_get()
        got = sum(len(p.vertices) - 2 for p in obj.evaluated_get(dg).data.polygons)
        if got <= target_tris * 1.01 or attempt == 7:
            bpy.ops.object.modifier_apply(modifier=m.name)
            break
        obj.modifiers.remove(m)
        ratio *= target_tris / got
    got = tri_count(obj)
    log(f"decimated {obj.name}: {have} -> {got} tris (target {target_tris})")
    return got


def split_components(obj, key, name):
    """Moves the connected components for which key(centroid) is true into a new object; returns it."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    seen = set()
    move = []
    for f in bm.faces:
        if f.index in seen:
            continue
        comp, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g.index)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        c = sum((bm.faces[i].calc_center_median() for i in comp), Vector()) / len(comp)
        if key(c):
            move.extend(comp)
    bm.free()
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for i in move:
        obj.data.polygons[i].select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    new = next(o for o in bpy.context.selected_objects if o is not obj)
    new.name = name
    return new


def decimate_region(obj, inside, target_region_tris):
    """Decimates only the faces whose vertices all satisfy inside(co) to target_region_tris; the rest is frozen
    (weight-0 vertices of an inverted 'keep' group do not collapse at a high group factor)."""
    protect_group(obj, lambda co: 0.0 if inside(co) else 1.0, "keep")
    region = sum(len(p.vertices) - 2 for p in obj.data.polygons if all(inside(obj.data.vertices[i].co) for i in p.vertices))
    total = tri_count(obj)
    decimate(obj, total - region + target_region_tris, "keep", 100.0)
    obj.vertex_groups.remove(obj.vertex_groups["keep"])


def decimate_body(body, budget, hand_x=0.3):
    """Hands and head/neck are separate components once the sleeves' faces are gone, so each gets its own budget;
    inside the head the face (front, eyes to chin) and the rest (scalp under the hair, ears, neck) are decimated
    separately so the face keeps its detail."""
    hands = split_components(body, lambda c: abs(c.x) > hand_x, f"{body.name}.hands")
    decimate(hands, budget["hands"])

    def face(co):
        return co.z > HEAD_Z + budget["faceAboveHeadJoint"] and co.y < budget["faceBehindY"] and abs(co.x) < budget["faceHalfWidth"]

    decimate_region(body, lambda co: not face(co), budget["headRest"])
    decimate_region(body, face, budget["face"])
    activate(body, [hands])
    bpy.ops.object.join()
    return tri_count(body)


# ---------------------------------------------------------------------------------------------------- 4. atlases


def uv_islands(bm, uv_layer):
    """Faces grouped into UV islands (connected through edges whose two loops share UVs)."""
    bm.faces.ensure_lookup_table()
    seen = set()
    islands = []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack = [f]
        seen.add(f.index)
        isl = []
        while stack:
            g = stack.pop()
            isl.append(g)
            for loop in g.loops:
                e = loop.edge
                for other in e.link_loops:
                    h = other.face
                    if h.index in seen or h is g:
                        continue
                    # contiguous if the shared edge has the same UVs on both faces
                    a0, a1 = loop[uv_layer].uv, loop.link_loop_next[uv_layer].uv
                    b0, b1 = other[uv_layer].uv, other.link_loop_next[uv_layer].uv
                    if ((a0 - b1).length < 1e-5 and (a1 - b0).length < 1e-5) or ((a0 - b0).length < 1e-5 and (a1 - b1).length < 1e-5):
                        seen.add(h.index)
                        stack.append(h)
        islands.append(isl)
    return islands




# ---------------------------------------------------------------------------------------------------- 4. atlases


def prepare_atlas_uv(obj, texels_per_uv_m):
    """Adds the 'atlas' UV (a copy of the source UVs) with every island scaled to the same texel density:
    texels_per_uv_m = target px/m / atlas size (UV units per metre)."""
    me = obj.data
    if "atlas" not in me.uv_layers:
        me.uv_layers.active = me.uv_layers["UVMap"]
        me.uv_layers.new(name="atlas", do_init=True)
    me.uv_layers.active = me.uv_layers["atlas"]
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv["atlas"]
    for isl in uv_islands(bm, uvl):
        a3 = sum(f.calc_area() for f in isl)
        auv = 0.0
        for f in isl:
            pts = [l[uvl].uv for l in f.loops]
            for i in range(1, len(pts) - 1):
                auv += abs((pts[i] - pts[0]).cross(pts[i + 1] - pts[0])) / 2
        if a3 <= 0 or auv <= 1e-12:
            continue
        k = math.sqrt(a3 / auv) * texels_per_uv_m
        uvc = sum((l[uvl].uv for f in isl for l in f.loops), Vector((0, 0))) / sum(len(f.loops) for f in isl)
        for f in isl:
            for l in f.loops:
                l[uvl].uv = uvc + (l[uvl].uv - uvc) * k
    bm.to_mesh(me)
    bm.free()


def uv_bounds(objs):
    lo, hi = 1e9, -1e9
    for o in objs:
        uv = np.empty(len(o.data.loops) * 2, dtype=np.float32)
        o.data.uv_layers["atlas"].data.foreach_get("uv", uv)
        if len(uv):
            lo, hi = min(lo, float(uv.min())), max(hi, float(uv.max()))
    return lo, hi


def pack_atlas(objs, margin):
    """Packs the islands at their size (the texel density holds); only if they do not fit are they scaled down."""
    activate(objs[0], objs[1:])
    for scale in (False, True):
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.context.scene.tool_settings.use_uv_select_sync = True
        bpy.ops.mesh.select_all(action="SELECT")
        # every island gets its own texels: the parts' source UVs all live in 0..1, so merging overlaps would merge
        # unrelated garments
        bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, rotate_method="CARDINAL", scale=scale,
                                merge_overlap=False, margin_method="FRACTION", margin=margin, shape_method="CONCAVE")
        bpy.ops.object.mode_set(mode="OBJECT")
        lo, hi = uv_bounds(objs)
        if lo >= -1e-4 and hi <= 1 + 1e-4:
            return not scale
        log("islands do not fit at the target density; packing scaled")
    raise RuntimeError("atlas UVs outside 0..1 after packing")


def texel_density(objs, size, keep=None):
    """Mean atlas texels per metre over the given objects' faces (keep(obj, poly) filters faces)."""
    a3 = auv = 0.0
    for o in objs:
        uv = o.data.uv_layers["atlas"].data
        for p in o.data.polygons:
            if keep and not keep(o, p):
                continue
            a3 += p.area
            pts = [uv[li].uv for li in p.loop_indices]
            for i in range(1, len(pts) - 1):
                auv += abs((pts[i] - pts[0]).cross(pts[i + 1] - pts[0])) / 2
    return round(size * math.sqrt(auv / a3)) if a3 > 0 else 0


# ------------------------------------------------------------------------------------------------ 4b. materials


class Src:
    """A bake-source material: base color, roughness, normal, occlusion and alpha from maps and constants, all
    sampled through the source UV ('UVMap'). The output is rewired per bake pass."""

    def __init__(self, name):
        self.mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        self.mat.use_nodes = True
        nt = self.mat.node_tree
        nt.nodes.clear()
        self.nt = nt
        self.out = nt.nodes.new("ShaderNodeOutputMaterial")
        self.bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        self.emit = nt.nodes.new("ShaderNodeEmission")
        self.uv = nt.nodes.new("ShaderNodeUVMap")
        self.uv.uv_map = "UVMap"
        self.color = self.value((0.8, 0.8, 0.8))
        self.rough = self.value(0.5)
        self.ao = self.value(1.0)
        self.alpha = self.value(1.0)
        self.normal = None
        self.target = None
        self.region = 0  # region index for the calibration pass ('id')
        self.weight = self.value(1.0)  # how much a texel counts (and is scaled) in its region's calibration
        self._id = None

    def value(self, v):
        if isinstance(v, (tuple, list)):
            n = self.nt.nodes.new("ShaderNodeRGB")
            n.outputs[0].default_value = (*v[:3], 1.0)
        else:
            n = self.nt.nodes.new("ShaderNodeValue")
            n.outputs[0].default_value = float(v)
        return n.outputs[0]

    def tex(self, path, colorspace="sRGB", scale=None):
        n = self.nt.nodes.new("ShaderNodeTexImage")
        n.image = load_image(path, colorspace)
        n.interpolation = "Cubic"
        if scale:
            mp = self.nt.nodes.new("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (scale, scale, 1.0)
            self.nt.links.new(self.uv.outputs[0], mp.inputs[0])
            self.nt.links.new(mp.outputs[0], n.inputs[0])
        else:
            self.nt.links.new(self.uv.outputs[0], n.inputs[0])
        return n

    def math(self, op, a, b=None, clamp=False):
        n = self.nt.nodes.new("ShaderNodeMath")
        n.operation = op
        n.use_clamp = clamp
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                self.nt.links.new(x, n.inputs[i])
        return n.outputs[0]

    def mix(self, a, b, fac, blend="MIX"):
        n = self.nt.nodes.new("ShaderNodeMix")
        n.data_type = "RGBA"
        n.blend_type = blend
        for sock, x in ((n.inputs["Factor"], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(x, (int, float)):
                sock.default_value = x
            elif isinstance(x, tuple):
                sock.default_value = (*x[:3], 1.0)
            else:
                self.nt.links.new(x, sock)
        return n.outputs[2]

    def luminance(self, col):
        n = self.nt.nodes.new("ShaderNodeRGBToBW")
        self.nt.links.new(col, n.inputs[0])
        return n.outputs[0]

    def vmath(self, op, a, b=None, c=None):
        n = self.nt.nodes.new("ShaderNodeVectorMath")
        n.operation = op
        for i, x in enumerate((a, b, c)):
            if x is None:
                continue
            if isinstance(x, (tuple, list)):
                n.inputs[i].default_value = x
            else:
                self.nt.links.new(x, n.inputs[i])
        return n.outputs[0]

    def set_normal(self, path, strength=1.0, detail=None):
        """Tangent-space normal map (OpenGL convention) on the source UV, optionally blended with a scanned detail
        normal tiled at physical scale (UDN blend in the shared tangent frame: xy added, z kept, renormalized)."""
        def unpack(tex_node, k):
            v = self.vmath("MULTIPLY_ADD", tex_node.outputs[0], (2.0, 2.0, 2.0), (-1.0, -1.0, -1.0))
            return self.vmath("MULTIPLY", v, (k, k, 1.0))

        n = unpack(self.tex(path, "Non-Color"), strength) if path else None
        if detail:
            d = unpack(self.tex(detail["path"], "Non-Color", detail["scale"]), detail.get("strength", 0.2))
            if n is None:
                n = d
            else:
                d_xy = self.vmath("MULTIPLY", d, (1.0, 1.0, 0.0))
                n = self.vmath("ADD", n, d_xy)
        n = self.vmath("NORMALIZE", n)
        packed = self.vmath("MULTIPLY_ADD", n, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5))
        nm = self.nt.nodes.new("ShaderNodeNormalMap")
        nm.uv_map = "UVMap"
        self.nt.links.new(packed, nm.inputs["Color"])
        self.normal = nm.outputs[0]

    def id_color(self):
        """Emission for the 'id' pass: R = region index / 32, G = calibration weight."""
        if self._id is None:
            rid = self.value(self.region / 32.0)
            comb = self.nt.nodes.new("ShaderNodeCombineColor")
            self.nt.links.new(rid, comb.inputs[0])
            self.nt.links.new(self.weight, comb.inputs[1])
            self._id = comb.outputs[0]
        return self._id

    def set_pass(self, which):
        nt = self.nt
        for link in list(self.out.inputs[0].links):
            nt.links.remove(link)
        for inp in ("Base Color", "Roughness", "Normal", "Alpha"):
            for link in list(self.bsdf.inputs[inp].links):
                nt.links.remove(link)
        if which == "normal":
            nt.links.new(self.color, self.bsdf.inputs["Base Color"])
            if self.normal is not None:
                nt.links.new(self.normal, self.bsdf.inputs["Normal"])
            nt.links.new(self.bsdf.outputs[0], self.out.inputs[0])
            return
        src = self.id_color() if which == "id" else {"color": self.color, "rough": self.rough, "ao": self.ao, "alpha": self.alpha}[which]
        for link in list(self.emit.inputs[0].links):
            nt.links.remove(link)
        nt.links.new(src, self.emit.inputs[0])
        self.emit.inputs[1].default_value = 1.0
        nt.links.new(self.emit.outputs[0], self.out.inputs[0])

    def set_target(self, image):
        if self.target is None:
            self.target = self.nt.nodes.new("ShaderNodeTexImage")
            tuv = self.nt.nodes.new("ShaderNodeUVMap")
            tuv.uv_map = "atlas"
            self.nt.links.new(tuv.outputs[0], self.target.inputs[0])
        self.target.image = image
        for n in self.nt.nodes:
            n.select = False
        self.target.select = True
        self.nt.nodes.active = self.target


def detail_scale(obj, tile_m):
    """UV multiplier that tiles a scanned texture of physical size tile_m over the object at real-world scale."""
    me = obj.data
    uv = me.uv_layers["UVMap"].data
    a3 = sum(p.area for p in me.polygons)
    auv = 0.0
    for p in me.polygons:
        pts = [uv[li].uv for li in p.loop_indices]
        for i in range(1, len(pts) - 1):
            auv += abs((pts[i] - pts[0]).cross(pts[i + 1] - pts[0])) / 2
    m_per_uv = math.sqrt(a3 / max(auv, 1e-9))
    return m_per_uv / tile_m




def hue_at(rgb8, lum_target):
    """Linear RGB with the hue of an sRGB 0-255 colour at a given linear luminance."""
    c = np.array(srgb8(rgb8))
    return tuple(float(x) for x in c * (lum_target / max(float(lum(c)), 1e-6)))


def hsv_adjust(s, col, hue=0.5, sat=1.0, val=1.0):
    n = s.nt.nodes.new("ShaderNodeHueSaturation")
    n.inputs["Hue"].default_value = hue
    n.inputs["Saturation"].default_value = sat
    n.inputs["Value"].default_value = val
    n.inputs["Fac"].default_value = 1.0
    s.nt.links.new(col, n.inputs["Color"])
    return n.outputs[0]


def _position(s):
    """Object-space position (rest pose, metres; the parts sit at the rig's origin) as a vector socket."""
    n = s.nt.nodes.new("ShaderNodeTexCoord")
    return n.outputs["Object"]


def _noise(s, scale, detail=3.0, roughness=0.55, offset=(0.0, 0.0, 0.0)):
    """Deterministic 3D value noise (Blender's Perlin 'Noise Texture') over the rest-pose position, 0..1."""
    n = s.nt.nodes.new("ShaderNodeTexNoise")
    n.noise_dimensions = "3D"
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = roughness
    s.nt.links.new(s.vmath("ADD", _position(s), offset), n.inputs["Vector"])
    return n.outputs["Fac"]


def _band(s, x, lo, hi):
    """Smooth 0..1 ramp of x between lo and hi."""
    n = s.nt.nodes.new("ShaderNodeMapRange")
    n.interpolation_type = "SMOOTHSTEP"
    n.inputs["From Min"].default_value = lo
    n.inputs["From Max"].default_value = hi
    s.nt.links.new(x, n.inputs["Value"])
    return n.outputs["Result"]


def stripes(s, col, spec):
    """Horizontal retro-reflective bands (a hi-vis vest): `z` = [[lo, hi], ...] as fractions of the head joint's
    height, in `hue` at `ratio` times the garment's luminance."""
    sep = s.nt.nodes.new("ShaderNodeSeparateXYZ")
    s.nt.links.new(_position(s), sep.inputs[0])
    z = sep.outputs["Z"]
    mask = None
    for lo, hi in spec["z"]:
        m = s.math("MULTIPLY", s.math("GREATER_THAN", z, lo * HEAD_Z), s.math("LESS_THAN", z, hi * HEAD_Z))
        mask = m if mask is None else s.math("MAXIMUM", mask, m)
    return s.mix(col, hue_at(spec["hue"], 0.25 * spec.get("ratio", 1.0)), mask)


def grime(s, col, spec):
    """The clothes of the dead: dirt (object-space noise darkening the fabric), dried blood (a brownish red where a
    second noise runs high) and tears (ragged dark holes where a fine noise runs high). All deterministic."""
    dirt = _band(s, _noise(s, spec.get("dirtScale", 7.0)), 0.42, 0.72)
    col = s.mix(col, s.mix(col, (0.0, 0.0, 0.0), 1.0 - spec.get("dirtDarken", 0.5)), s.math("MULTIPLY", dirt, spec.get("dirt", 1.0)), "MIX")
    col = s.mix(col, srgb8(spec.get("dirtHue", [96, 84, 62])), s.math("MULTIPLY", dirt, 0.35 * spec.get("dirt", 1.0)), "MULTIPLY")
    if spec.get("blood"):
        b = _band(s, _noise(s, spec.get("bloodScale", 4.0), 4.0, 0.6, (3.1, 7.3, 1.7)), spec.get("bloodThreshold", 0.62), spec.get("bloodThreshold", 0.62) + 0.08)
        col = s.mix(col, srgb8([80, 22, 15]), s.math("MULTIPLY", b, spec["blood"]))
    if spec.get("tears"):
        t = _band(s, _noise(s, spec.get("tearScale", 16.0), 6.0, 0.7, (11.0, 5.0, 2.0)), 0.78 - spec["tears"], 0.8 - spec["tears"])
        col = s.mix(col, srgb8(spec.get("tearHue", [34, 30, 26])), t)
    return col


def region_source(name, spec, obj, tex, region_index):
    """A garment region's bake source. Base color: the garment texture ('base': 'texture', optionally desaturated) or
    a hue ('base': 'hue') times the fabric scan's relative variation; only its hue and variation matter, since the
    calibration pass sets each region's mean albedo. Normal: the garment's normal map plus the scan's detail normal.
    Occlusion: the garment's AO map. 'textureDetail' (a contrast exponent) keeps some of the garment texture's
    light/dark variation under a recolour."""
    s = Src(f"src.{name}.{obj.name}")
    s.region = region_index[name]
    if spec.get("base") == "texture":
        col = s.tex(tex["diffuse"]).outputs[0]
        if "saturation" in spec:
            col = hsv_adjust(s, col, sat=spec["saturation"])
    else:
        col = s.value(hue_at(spec["hue"], 0.25))
    scan = spec.get("scan", {})
    if scan.get("color"):
        path = source_file(scan["color"])
        t = s.tex(path, "sRGB", detail_scale(obj, scan["tileM"]))
        var = s.math("POWER", s.math("DIVIDE", s.luminance(t.outputs[0]), image_mean_lum(path)), scan.get("contrast", 0.5))
        col = s.mix(col, var, 1.0, "MULTIPLY")
    if spec.get("textureDetail"):
        path = tex["diffuse"]
        var = s.math("POWER", s.math("DIVIDE", s.luminance(s.tex(path).outputs[0]), image_mean_lum(path)), spec["textureDetail"])
        col = s.mix(col, var, 1.0, "MULTIPLY")
    if spec.get("stripes"):
        col = stripes(s, col, spec["stripes"])
    if spec.get("grime"):
        col = grime(s, col, spec["grime"])
    s.color = col
    lo, hi = spec["roughness"]
    if scan.get("rough"):
        r = s.tex(source_file(scan["rough"]), "Non-Color", detail_scale(obj, scan["tileM"])).outputs[0]
        s.rough = s.math("ADD", s.math("MULTIPLY", r, hi - lo), lo)
    else:
        s.rough = s.value((lo + hi) / 2)
    detail = None
    if scan.get("normal"):
        detail = {"path": source_file(scan["normal"]), "scale": detail_scale(obj, scan["tileM"]), "strength": scan.get("normalStrength", 0.2)}
    if tex.get("normal") or detail:
        s.set_normal(tex.get("normal"), spec.get("normalStrength", 1.0), detail)
    if tex.get("ao"):
        s.ao = s.tex(tex["ao"], "Non-Color").outputs[0]
    return s


def build_sources(recipe, by_role, tex, region_index):
    """Bake sources for every role: [Src per material slot]."""
    M = recipe["materials"]
    out = {}
    garments = recipe["garments"]
    for role, g in garments.items():
        obj = by_role[role]
        out[role] = [region_source(r, M[r], obj, tex[role], region_index) for r in g["regions"]]
    for role in recipe.get("generated", {}):
        obj = by_role[role]
        r = recipe["generated"][role]["region"]
        out[role] = [region_source(r, M[r], obj, {}, region_index)]

    # skin: MakeHuman diffuse, Mindfront scan normal and specular -> roughness on the same UV layout; the scalp
    # under the hair takes the hair's calibrated colour and is left out of the skin's calibration
    sk = M["skin"]
    s = Src("src.skin")
    s.region = region_index["skin"]
    col = s.tex(tex["skin"]["diffuseTexture"]).outputs[0]
    if sk.get("tint"):
        # the dead: the skin drained of its colour and shifted toward the tint's hue (grey-green), then mottled
        col = hsv_adjust(s, col, sat=sk.get("saturation", 0.3))
        c = np.array(srgb8(sk["tint"]))
        col = s.mix(col, tuple(float(x) for x in c / max(float(lum(c)), 1e-6)), 1.0, "MULTIPLY")
    if sk.get("grime"):
        col = grime(s, col, sk["grime"])
    attr = s.nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "haircap"
    capf = s.math("MULTIPLY", attr.outputs["Fac"], sk.get("hairCapStrength", 1.0))
    s.color = s.mix(col, hue_at(M["hair"]["hue"], M["hair"]["albedo"]), capf)
    s.weight = s.math("SUBTRACT", 1.0, s.math("MINIMUM", s.math("MULTIPLY", capf, 3.0), 1.0))
    spec_l = s.luminance(s.tex(tex["skin_detail"]["specularTexture"], "Non-Color").outputs[0])
    spec_n = s.math("DIVIDE", spec_l, image_mean_lum(tex["skin_detail"]["specularTexture"], "Non-Color"))
    lo, hi = sk["roughness"]
    rough = s.math("MINIMUM", s.math("MAXIMUM", s.math("SUBTRACT", (lo + hi) / 2, s.math("MULTIPLY", s.math("SUBTRACT", spec_n, 1.0), (hi - lo) / 2)), lo), hi)
    s.rough = s.math("ADD", s.math("MULTIPLY", rough, s.math("SUBTRACT", 1.0, capf)), s.math("MULTIPLY", capf, M["hair"]["roughness"]))
    s.set_normal(tex["skin_detail"]["normalmapTexture"], sk.get("normalStrength", 1.0))
    s.ao = s.math("SUBTRACT", 1.0, s.math("MULTIPLY", capf, 0.35))
    out["body"] = [s]

    e = Src("src.eyes")
    e.region = region_index["eyes"]
    ey = M["eyes"]
    e.color = hsv_adjust(e, e.tex(tex["eyes"]).outputs[0], hue=ey.get("hue", 0.5), sat=ey["saturation"], val=ey["value"])
    e.rough = e.value(ey["roughness"])
    out["eyes"] = [e]

    for key in ("hair", "eyebrows", "eyelashes"):
        h = Src(f"src.{key}")
        h.region = region_index[key]
        # the MakeHuman strand textures are nearly black: a gain to the target would blow up their highlights, so
        # the hair takes the recipe's hue with the strands' relative variation at reduced contrast
        path = tex[key]["diffuseTexture"]
        t = h.tex(path)
        var = h.math("POWER", h.math("DIVIDE", h.math("MAXIMUM", h.luminance(t.outputs[0]), 1e-4), image_mean_lum(path)), M[key].get("contrast", 0.45))
        h.color = h.mix(h.value(hue_at(M[key].get("hue", M["hair"]["hue"]), 0.25)), var, 1.0, "MULTIPLY")
        # alphaGain: sparse strokes (eyebrows) would mostly fall under the alpha-test cutoff at game texel density
        h.alpha = h.math("MINIMUM", h.math("MULTIPLY", t.outputs[1], M[key].get("alphaGain", 1.0)), 1.0)
        h.weight = t.outputs[1]
        h.rough = h.value(M[key].get("roughness", M["hair"]["roughness"]))
        if tex[key].get("normalmapTexture"):
            h.set_normal(tex[key]["normalmapTexture"], 0.6)
        out[key] = [h]
    return out


def calibrate(color, ids, region_index, materials):
    """Scales each region's baked albedo to its recipe target (mean linear luminance over its texels, weighted), then
    clamps every texel to ART.md's limits keeping its hue. color: sRGB-encoded RGBA (h, w, 4); ids: the 'id' bake.
    Returns (new color, stats per region)."""
    lin = to_linear(np.clip(color[..., :3], 0, 1))
    L = lum(np.moveaxis(lin, -1, 0))
    rid = np.rint(ids[..., 0] * 32).astype(int)
    w = ids[..., 1]
    stats = {}
    for name, idx in region_index.items():
        m = (rid == idx) & (w > 0.02)
        if not m.any():
            continue
        target = materials.get(name, {}).get("albedo")
        before = float((L[m] * w[m]).sum() / w[m].sum())
        if target is not None:
            # texels scale by 1 + (f - 1) * weight; f solves: weighted mean after scaling = target
            wm, Lm = w[m], L[m]
            g = (target * wm.sum() - (wm * Lm).sum()) / max(float((wm * wm * Lm).sum()), 1e-9)
            lin[m] *= (1.0 + g * wm)[:, None]
        stats[name] = {"target": target, "before": round(before, 4)}
    L = lum(np.moveaxis(lin, -1, 0))
    black = L < 1e-4
    lin[black] = ALBEDO_MIN
    L = lum(np.moveaxis(lin, -1, 0))
    lo = L < ALBEDO_MIN
    lin[lo] *= (ALBEDO_MIN / L[lo])[:, None]
    L = lum(np.moveaxis(lin, -1, 0))
    hi = L > ALBEDO_MAX
    lin[hi] *= (ALBEDO_MAX / L[hi])[:, None]
    lin = np.clip(lin, 0.0, 1.0)
    L = lum(np.moveaxis(lin, -1, 0))
    for name, idx in region_index.items():
        m = (rid == idx) & (w > 0.02)
        if name not in stats:
            continue
        mean_rgb = (lin[m] * w[m][:, None]).sum(axis=0) / w[m].sum()
        enc = np.where(mean_rgb <= 0.0031308, mean_rgb * 12.92, 1.055 * mean_rgb ** (1 / 2.4) - 0.055)
        stats[name].update(after=round(float((L[m] * w[m]).sum() / w[m].sum()), 4),
                           p005=round(float(np.percentile(L[m], 0.5)), 4), p995=round(float(np.percentile(L[m], 99.5)), 4),
                           meanSRGB=[int(round(x * 255)) for x in enc],
                           hsvS=round(float((enc.max() - enc.min()) / max(enc.max(), 1e-6)), 3))
    enc = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out = color.copy()
    out[..., :3] = enc
    return out, stats
def hair_cap(body, hair, reach=0.04, soften=3):
    """Vertex attribute 'haircap' on the body: 1 where the scalp is covered by the hair mesh (a ray along the skin
    normal hits it within `reach`), softened over a few vertex rings so the hairline fades instead of stepping."""
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(hair, dg)
    me = body.data
    vals = np.zeros(len(me.vertices))
    for v in me.vertices:
        if v.co.z < HEAD_Z - 0.08:
            continue
        hit = bvh.ray_cast(v.co + v.normal * 0.001, v.normal, reach)
        vals[v.index] = 1.0 if hit[0] is not None else 0.0
    edges = np.array([e.vertices[:] for e in me.edges], dtype=np.int64)
    for _ in range(soften):
        acc = vals.copy()
        cnt = np.ones(len(vals))
        np.add.at(acc, edges[:, 0], vals[edges[:, 1]])
        np.add.at(acc, edges[:, 1], vals[edges[:, 0]])
        np.add.at(cnt, edges[:, 0], 1)
        np.add.at(cnt, edges[:, 1], 1)
        vals = acc / cnt
    attr = me.attributes.get("haircap") or me.attributes.new("haircap", "FLOAT", "POINT")
    attr.data.foreach_set("value", vals.tolist())


# ------------------------------------------------------------------------------------------------------ 4c. bake


def setup_cycles(samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception:  # noqa: BLE001
        scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.cycles.seed = 0  # the rebuild recipe's fixed Cycles seed (assets/characters/manifest.json)
    scene.cycles.use_animated_seed = False
    scene.render.bake.margin = 8
    scene.render.bake.margin_type = "EXTEND"
    scene.render.bake.use_clear = True


def bake_group(name, objs, srcs_by_obj, size, passes, out_dir, no_occluders=()):
    """Bakes the requested passes of one atlas group; returns {pass: numpy array (h, w, 4)}. Objects in no_occluders
    are hidden from the geometric occlusion pass (alpha-tested hair cards would print their shapes onto the skin)."""
    results = {}
    for which in passes:
        for o in no_occluders:
            o.hide_render = which == "geo_ao"
        colorspace = "sRGB" if which == "color" else "Non-Color"
        img = bpy.data.images.new(f"bake.{name}.{which}", size, size, alpha=False, float_buffer=which == "normal")
        img.colorspace_settings.name = colorspace
        for srcs in srcs_by_obj.values():
            for s in srcs:
                s.set_pass("color" if which == "geo_ao" else which)
                s.set_target(img)
        activate(objs[0], objs[1:])
        for o in objs:
            o.data.uv_layers.active = o.data.uv_layers["atlas"]
        scene = bpy.context.scene
        if which == "normal":
            scene.cycles.samples = 16
            bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", use_clear=True, margin=8)
        elif which == "geo_ao":
            scene.cycles.samples = 128
            scene.world.light_settings.distance = 0.12
            bpy.ops.object.bake(type="AO", use_clear=True, margin=8)
        elif which == "id":
            scene.cycles.samples = 1  # no anti-aliasing: region indices stay exact
            bpy.ops.object.bake(type="EMIT", use_clear=True, margin=8)
        else:
            scene.cycles.samples = 16
            bpy.ops.object.bake(type="EMIT", use_clear=True, margin=8)
        results[which] = image_array(img).copy()
        path = os.path.join(out_dir, f"{name}_{which}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        log(f"baked {name}.{which} ({size}px) -> {os.path.relpath(path, common.ROOT)}")
    return results


def write_png(path, arr, colorspace="Non-Color"):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    return img


# -------------------------------------------------------------------------------------------- 4d. final material


def final_material(name, maps, alpha=False):
    """Principled BSDF over the baked atlas maps, laid out so the glTF exporter writes baseColor, normal,
    metallicRoughness and occlusion (ORM: R occlusion, G roughness, B metallic)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "atlas"

    def img(path, cs):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = load_image(path, cs)
        nt.links.new(uv.outputs[0], t.inputs[0])
        return t

    col = img(maps["color"], "sRGB")
    nt.links.new(col.outputs[0], bsdf.inputs["Base Color"])
    if alpha:
        nt.links.new(col.outputs[1], bsdf.inputs["Alpha"])
    orm = img(maps["orm"], "Non-Color")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[1], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs[2], bsdf.inputs["Metallic"])
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gn = nt.nodes.new("ShaderNodeGroup")
    gn.node_tree = group
    nt.links.new(sep.outputs[0], gn.inputs["Occlusion"])
    nrm = img(maps["normal"], "Non-Color")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.uv_map = "atlas"
    nt.links.new(nrm.outputs[0], nm.inputs["Color"])
    nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    return mat



def limit_weights(obj, rig, max_influences=4):
    bones = {b.name for b in rig.data.bones if b.use_deform}
    for g in list(obj.vertex_groups):
        if g.name not in bones:
            obj.vertex_groups.remove(g)
    activate(obj)
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=max_influences)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    worst = max((len(v.groups) for v in obj.data.vertices), default=0)
    unweighted = sum(1 for v in obj.data.vertices if not v.groups)
    return worst, unweighted



# ------------------------------------------------------------------------------------------------------- 5. main


def main():
    args = common.script_args()
    recipe_path = os.path.abspath(args[0]) if args and not args[0].startswith("--") else os.path.join(common.HERE, "wage.json")
    stop = args[args.index("--stop-after") + 1] if "--stop-after" in args else None
    recipe = common.load_json(recipe_path)
    cid = recipe["id"]
    out_dir = os.path.dirname(common.work(cid, "bake", "x"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    common.enable_mpfb()
    rig, parts = build_human(recipe)
    global HEAD_Z  # noqa: PLW0603
    HEAD_Z = rig.data.bones["head"].head_local.z
    log("MPFB parts:", {k: tri_count(v) for k, v in parts.items()}, f"head joint z={HEAD_Z:.3f}")
    body = parts["body"]
    bake_body(body)
    by_role = {role: parts[key] for role, key in recipe["roles"].items()}
    arm_deg = lower_arms_rest(rig, list(by_role.values()), recipe["restPose"])
    log(f"rest pose: upper arms {arm_deg:.1f} degrees below the horizontal")

    # textures of every part
    spec = recipe["mpfb"]
    tex = {
        "skin": mhmat_textures(mpfb_asset(spec["skin_mhmat"], "skins")),
        "skin_detail": mhmat_textures(mpfb_asset(recipe["skinDetail"], "skins")),
        "hair": mhmat_textures(mpfb_asset(spec["hair"].replace(".mhclo", ".mhmat"), "hair")),
        "eyebrows": mhmat_textures(mpfb_asset(spec["eyebrows"].replace(".mhclo", ".mhmat"), "eyebrows")),
        "eyelashes": mhmat_textures(mpfb_asset(spec["eyelashes"].replace(".mhclo", ".mhmat"), "eyelashes")),
        "eyes": mhmat_textures(mpfb_asset(recipe["eyeMaterial"], "eyes"))["diffuseTexture"],
    }
    for role, g in recipe["garments"].items():
        key = recipe["roles"][role]
        t = mhmat_textures(mpfb_asset(f"{key}/{key}.mhmat", "clothes"))
        tex[role] = {"diffuse": t.get("diffuseTexture"), "normal": t.get("normalmapTexture"), "ao": t.get("aomapTexture")}

    # garment regions
    region_names = []
    for role, g in recipe["garments"].items():
        o = by_role[role]
        assign_regions(o, classify_garment(o, g, tex[role]["diffuse"]), g["regions"])
        region_names += g["regions"]
    if recipe.get("collarFollow"):
        # a collar standing behind a thick neck (a jacket's, a heavy body's T-shirt) follows the neck and head like
        # the hood's lip, so it does not rise behind the head when the trunk leans
        neck_follow(by_role["top"], rig, recipe["collarFollow"])
    # generated parts (recipe 'generated'): the hood and drawstrings on a hoodie, a backpack
    gen = recipe.get("generated", {})
    if "hood" in gen:
        hoodie_mat = bpy.data.materials.new("src.hood")
        hood = finish_generated(f"{cid}.hood", make_hood(recipe, by_role["top"], rig), by_role["top"], rig, hoodie_mat, recipe["hood"]["shell"])
        neck_follow(hood, rig, recipe["hood"])
        by_role["hood"] = hood
    if "strings" in gen:
        by_role["strings"] = finish_generated(f"{cid}.strings", make_drawstrings(recipe, by_role["top"], rig, Builder()), by_role["top"], rig, hoodie_mat)
    if "backpack" in gen:
        pack_mat = bpy.data.materials.new("src.backpack")
        pack_b, straps_b = make_backpack(recipe, by_role["top"], rig, [by_role["hood"]] if "hood" in by_role else [])
        pack = finish_generated(f"{cid}.backpack", pack_b, by_role["top"], rig, pack_mat, recipe["backpack"]["shell"])
        bind_rigid(pack, recipe["backpack"]["bind"])
        by_role["backpack"] = pack
        by_role["straps"] = finish_generated(f"{cid}.straps", straps_b, by_role["top"], rig, pack_mat)
    region_names += [g["region"] for g in gen.values()]
    region_names += ["skin", "eyes", "hair", "eyebrows", "eyelashes"]
    region_index = {}
    for n in region_names:
        region_index.setdefault(n, len(region_index) + 1)
    if stop == "regions":
        bpy.ops.wm.save_as_mainfile(filepath=common.work(cid, "debug_regions.blend"))
        return

    # decimation to the per-part budgets; the face keeps its detail, fingers and scalp give it up first
    B = recipe["budgets"]["triangles"]
    # the hands are the components out beyond the wrists: 0.3 m from the midline, or the recipe's handsBeyondX (a
    # smaller body)
    decimate_body(body, B["body"], B["body"].get("handsBeyondX", 0.3))
    for role, target in B.items():
        if role != "body":
            decimate(by_role[role], target)
    tris = {role: tri_count(o) for role, o in by_role.items()}
    log("triangles per part:", tris, "total", sum(tris.values()))
    if stop == "decimate":
        bpy.ops.wm.save_as_mainfile(filepath=common.work(cid, "debug_decimate.blend"))
        return

    hair_cap(body, by_role["hair"])
    srcs = build_sources(recipe, by_role, tex, region_index)
    for role, o in by_role.items():
        set_slots(o, [s.mat for s in srcs[role]])

    groups = recipe["atlases"]
    density_target = recipe["texelDensity"]
    setup_cycles(16)
    bpy.context.scene.world = bpy.context.scene.world or bpy.data.worlds.new("bake")
    final, density, calib = {}, {}, {}
    for gname, g in groups.items():
        objs = [by_role[r] for r in g["roles"]]
        for r in g["roles"]:
            # small, detailed parts (eyebrows, lashes) can take more texels than the density target
            prepare_atlas_uv(by_role[r], density_target / g["size"] * g.get("roleScale", {}).get(r, 1.0))
        exact = pack_atlas(objs, g["margin"])
        density[gname] = texel_density(objs, g["size"])
        log(f"atlas {gname} {g['size']}px: {density[gname]} px/m ({'at' if exact else 'below'} the {density_target} px/m target)")
        passes = ["color", "rough", "ao", "normal", "id"] + (["alpha"] if g.get("alpha") else []) + (["geo_ao"] if g.get("geoAO") else [])
        hair_cards = [by_role[r] for r in groups["hair"]["roles"]] if gname != "hair" else []
        res = bake_group(gname, objs, {o.name: srcs[r] for r, o in by_role.items() if o in objs}, g["size"], passes, out_dir, hair_cards)
        for o in hair_cards:
            o.hide_render = False
        color, stats = calibrate(res["color"], res["id"], region_index, recipe["materials"])
        calib.update(stats)
        log(f"calibrated {gname}:", json.dumps(stats))
        ao = res["ao"][..., 0]
        if "geo_ao" in res:
            ao = ao * (1.0 - g["geoAO"] * (1.0 - res["geo_ao"][..., 0]))
        orm = np.stack([ao, res["rough"][..., 0], np.zeros_like(ao), np.ones_like(ao)], axis=-1)
        orm_path = os.path.join(out_dir, f"{gname}_orm.png")
        write_png(orm_path, orm)
        if "alpha" in res:
            color[..., 3] = res["alpha"][..., 0]
            color_path = os.path.join(out_dir, f"{gname}_color_alpha.png")
        else:
            color[..., 3] = 1.0
            color_path = os.path.join(out_dir, f"{gname}_color.png")
        write_png(color_path, color, "sRGB")
        final[gname] = {"color": color_path, "orm": orm_path, "normal": os.path.join(out_dir, f"{gname}_normal.png")}
    if stop == "bake":
        bpy.ops.wm.save_as_mainfile(filepath=common.work(cid, "debug_bake.blend"))
        return

    # final materials, source UVs dropped, one mesh
    mats = {gname: final_material(f"{cid}_{gname}", maps, alpha=bool(groups[gname].get("alpha"))) for gname, maps in final.items()}
    for gname, g in groups.items():
        for r in g["roles"]:
            o = by_role[r]
            o.data.materials.clear()
            o.data.materials.append(mats[gname])
            for p in o.data.polygons:
                p.material_index = 0
            o.data.uv_layers.remove(o.data.uv_layers["UVMap"])
    objs = list(by_role.values())
    # recipe soleFromShoes: the shoes' vertices carry a 'shoe' attribute into the joined mesh, and animate.py takes the
    # soles' contact points from them only (a trouser hem that reaches the floor, bound to the foot, is not a sole)
    for role, o in by_role.items() if recipe.get("soleFromShoes") else ():
        attr = o.data.attributes.new("shoe", "FLOAT", "POINT")
        attr.data.foreach_set("value", [1.0 if role == "shoes" else 0.0] * len(o.data.vertices))
    for o in objs:
        for m in list(o.modifiers):
            if m.type != "ARMATURE":
                o.modifiers.remove(m)
    activate(body, [o for o in objs if o is not body])
    bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active
    rig.name = f"{cid}_rig"
    rig.data.name = f"{cid}_rig"
    mesh.name = cid
    mesh.data.name = cid
    for a in list(mesh.data.attributes):
        if a.name == "haircap":
            mesh.data.attributes.remove(a)
    worst, unweighted = limit_weights(mesh, rig, recipe["budgets"]["maxInfluences"])
    mesh.parent = rig
    height = max((mesh.matrix_world @ v.co).z for v in mesh.data.vertices)
    summary = {
        "triangles": tri_count(mesh),
        "vertices": len(mesh.data.vertices),
        "parts": tris,
        "maxInfluences": worst,
        "unweightedVertices": unweighted,
        "bones": len([b for b in rig.data.bones if b.use_deform]),
        "heightM": round(height, 4),
        "restArmDeg": round(arm_deg, 1),
        "materials": [m.name for m in mesh.data.materials],
        "atlases": {g: groups[g]["size"] for g in groups},
        "texelDensityPxPerM": density,
        "albedo": calib,
    }
    common.save_json(common.work(cid, "character_summary.json"), summary)
    bpy.ops.wm.save_as_mainfile(filepath=common.work(cid, "character.blend"))
    print("SUMMARY " + json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
