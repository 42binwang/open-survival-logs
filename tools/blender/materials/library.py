"""Node materials for Blender built from assets/materials/library.json (the shipped KTX2 textures).

    from materials import library as lib
    lib.assign(obj, "plaster_painted", tint="sage", wear=0.4, dirt=0.2, seed=3)

- Textures are the KTX2 files the game ships, decoded to PNG with tools/bin/ktx into a local cache
  (tools/blender/materials/.cache/, gitignored), so renders and bakes see exactly what the renderer gets.
- Mesh UVs are expected in meters (1 UV unit = 1 m); the material divides them by the material's sizeM.
- Per-instance parameters are object custom properties read by Attribute nodes, so one material serves every
  instance: sl_set (1 when assigned), sl_tint / sl_tint2 (linear RGB), sl_wear, sl_dirt (0..1), sl_seed (the integer,
  for reference) and sl_seed_u / sl_seed_v: the variation offset frac(seed * phi), frac(seed * (sqrt 2 - 1)), wrapped
  to [0, 1) in Python's float64 so no shader ever multiplies a large seed in float32 (seed_offset()).
- Layer stack (library.json "conventions"): tint -> macro variation -> AO -> edge wear (Cycles bevel curvature,
  broken up by the variation mask) -> cavity darkening -> gravity/cavity/grime dirt. Object origins sit at the
  floor contact point (gravity dirt measures height from the object origin).
"""

from __future__ import annotations

import colorsys
import hashlib
import json
import os
import random
import subprocess

import bpy

from common import paths
from common.nodes import Tree, new_material
from materials.tints import check_use, resolve_tint, srgb_hex_to_linear  # noqa: F401  (re-exported for callers)

CACHE = paths.repo("tools", "blender", "materials", ".cache")
_library: dict | None = None


def load() -> dict:
    global _library
    if _library is None:
        with open(paths.repo("assets", "materials", "library.json"), encoding="utf-8") as f:
            _library = json.load(f)
    return _library


def entry(material_id: str) -> dict:
    """A manifest entry by asset id ('materials/plaster_painted') or short name ('plaster_painted')."""
    want = material_id if "/" in material_id else f"materials/{material_id}"
    for a in load()["assets"]:
        if a["id"] == want:
            return a
    raise KeyError(f"unknown material {material_id}")


def ids() -> list[str]:
    """Short names of every material in the library."""
    return [a["id"].split("/", 1)[1] for a in load()["assets"] if a["kind"] == "material"]


def decoded_png(ktx_rel: str, sha256: str) -> str:
    """Decodes level 0 of a KTX2 file to PNG once per content hash."""
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, ktx_rel.replace("/", "__").replace(".ktx2", f".{sha256[:12]}.png"))
    if not os.path.exists(out):
        src = paths.repo(*ktx_rel.split("/"))
        with open(src, "rb") as f:
            if hashlib.sha256(f.read()).hexdigest() != sha256:
                raise RuntimeError(f"{ktx_rel} does not match library.json (rebuild the library)")
        subprocess.run([paths.ktx_bin(), "extract", "--transcode", "rgba8", "--level", "0", src, out], check=True)
    return out


def _image(path: str, data: bool) -> bpy.types.Image:
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    img.alpha_mode = "CHANNEL_PACKED"
    return img


def _tex(t: Tree, img: bpy.types.Image, vector, interpolation: str = "Linear"):
    n = t.node("ShaderNodeTexImage", image=img, interpolation=interpolation, extension="REPEAT")
    t.nt.links.new(vector, n.inputs["Vector"])
    return n


def _attr(t: Tree, name: str):
    return t.node("ShaderNodeAttribute", attribute_type="OBJECT", attribute_name=name)


def _value(t: Tree, v: float):
    n = t.node("ShaderNodeValue")
    n.outputs[0].default_value = float(v)
    return n.outputs[0]


def _rgb(t: Tree, rgb):
    n = t.node("ShaderNodeRGB")
    n.outputs[0].default_value = (*rgb, 1.0)
    return n.outputs[0]


def material(material_id: str) -> bpy.types.Material:
    """Returns the Blender material for a library id (built once per blend file)."""
    e = entry(material_id)
    name = f"SL_{e['id'].split('/', 1)[1]}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat, nt = new_material(name)
    nt.nodes.clear()
    t = Tree(nt)
    p = e["params"]
    pbr, tint, wear, dirt, var = p["pbr"], p.get("tint", {}), p.get("wear", {}), p.get("dirt", {}), p.get("variation", {})

    coord = t.node("ShaderNodeTexCoord")
    geo = t.node("ShaderNodeNewGeometry")
    mapping = t.node("ShaderNodeMapping", vector_type="POINT")
    s = 1.0 / p["sizeM"][0]
    mapping.inputs["Scale"].default_value = (s, s, 1.0)
    t.link(coord, "UV", mapping, "Vector")
    uv = mapping.outputs["Vector"]

    files, shas = e["files"], {k: v["sha256"] for k, v in e["meta"]["maps"].items()}
    base_t = _tex(t, _image(decoded_png(files["baseColor"], shas["baseColor"]), False), uv)
    nrm_t = _tex(t, _image(decoded_png(files["normal"], shas["normal"]), True), uv)
    orm_t = _tex(t, _image(decoded_png(files["orm"], shas["orm"]), True), uv)
    orm = t.node("ShaderNodeSeparateColor")
    t.link(orm_t, "Color", orm, "Color")

    # instance parameters, with material defaults when the object was never assigned
    has = _attr(t, "sl_set").outputs["Fac"]
    default_tint = resolve_tint(e, None)
    default_tint2 = resolve_tint(e, None, secondary=True)
    tint_c = t.mix_color(has, _rgb(t, default_tint), _attr(t, "sl_tint").outputs["Color"])
    tint2_c = t.mix_color(has, _rgb(t, default_tint2), _attr(t, "sl_tint2").outputs["Color"])
    wear_amt = t.mix_float(has, 0.0, _attr(t, "sl_wear").outputs["Fac"])
    dirt_amt = t.mix_float(has, dirt.get("amount", 0.0), _attr(t, "sl_dirt").outputs["Fac"])

    # macro variation (shared periodic mask, meter UVs / scaleM, offset by the instance seed)
    v = entry(var["texture"])
    vmap = t.node("ShaderNodeMapping", vector_type="POINT")
    vs = 1.0 / var.get("scaleM", v["params"]["sizeM"])
    vmap.inputs["Scale"].default_value = (vs * p["sizeM"][0], vs * p["sizeM"][0], 1.0)
    t.link(mapping, "Vector", vmap, "Vector")
    seed_off = t.node("ShaderNodeCombineXYZ")
    t.link(_attr(t, "sl_seed_u"), "Fac", seed_off, "X")
    t.link(_attr(t, "sl_seed_v"), "Fac", seed_off, "Y")
    t.nt.links.new(seed_off.outputs["Vector"], vmap.inputs["Location"])
    var_t = _tex(t, _image(decoded_png(v["path"], v["meta"]["sha256"]), True), vmap.outputs["Vector"])
    var_rgb = t.node("ShaderNodeSeparateColor")
    t.link(var_t, "Color", var_rgb, "Color")
    var_a = var_t.outputs["Alpha"]

    # base color: tint (mask = alpha for 'alpha' materials) and macro value variation
    tint_mask = base_t.outputs["Alpha"] if tint.get("mask") == "alpha" else _value(t, 1.0)
    tint_mix = t.mix_color(tint_mask, tint2_c, tint_c)
    base = t.mix_color(1.0, base_t.outputs["Color"], tint_mix, blend="MULTIPLY")
    signed_r = t.math("SUBTRACT", t.math("MULTIPLY", var_rgb.outputs["Red"], 2.0), 1.0)
    value_var = t.math("ADD", 1.0, t.math("MULTIPLY", var.get("value", 0.0), signed_r))
    base = t.mix_color(1.0, base, _gray(t, value_var), blend="MULTIPLY")
    if var.get("hue"):
        hsv = t.node("ShaderNodeHueSaturation")
        t.nt.links.new(t.math("ADD", 0.5, t.math("MULTIPLY", var["hue"], signed_r)), hsv.inputs["Hue"])
        t.nt.links.new(base, hsv.inputs["Color"])
        base = hsv.outputs["Color"]
    ao_mix = t.math("ADD", 0.5, t.math("MULTIPLY", orm.outputs["Red"], 0.5))
    base = t.mix_color(1.0, base, _gray(t, ao_mix), blend="MULTIPLY")

    rough = t.math("MULTIPLY", orm.outputs["Green"], pbr.get("roughnessFactor", 1.0))
    rough = t.math("ADD", rough, t.math("MULTIPLY", var.get("roughness", 0.0), t.math("SUBTRACT", t.math("MULTIPLY", var_rgb.outputs["Green"], 2.0), 1.0)), clamp=True)
    metal = t.math("MULTIPLY", orm.outputs["Blue"], pbr.get("metalnessFactor", 1.0))

    # edge wear from bevel-normal curvature (Cycles), broken up by the variation mask
    edge_cfg = wear.get("edge", {})
    bevel = t.node("ShaderNodeBevel", samples=8)
    bevel.inputs["Radius"].default_value = 0.012
    dot = t.node("ShaderNodeVectorMath", operation="DOT_PRODUCT")
    t.link(bevel, "Normal", dot, 0)
    t.link(geo, "Normal", dot, 1)
    curv = t.math("MULTIPLY", t.math("SUBTRACT", 1.0, dot.outputs["Value"]), 6.0, clamp=True)
    breakup = t.mix_float(edge_cfg.get("breakup", 0.5), 1.0, t.math("MULTIPLY", var_a, 2.0))
    curv = t.math("MULTIPLY", curv, breakup)
    thresh = t.math("SUBTRACT", 1.0, t.math("MULTIPLY", wear_amt, edge_cfg.get("amount", 0.0)))
    half = edge_cfg.get("width", 0.3) * 0.5
    wear_mask = t.map_range(curv, t.math("SUBTRACT", thresh, half), t.math("ADD", thresh, half))
    exp = edge_cfg["exposed"]
    base = t.mix_color(wear_mask, base, _rgb(t, srgb_hex_to_linear(exp["baseColor"])))
    rough = t.mix_float(wear_mask, rough, exp.get("roughness", 0.5))
    metal = t.mix_float(wear_mask, metal, exp.get("metalness", 0.0))

    # cavity: texture AO and geometric occlusion
    ao_geo = t.node("ShaderNodeAmbientOcclusion", only_local=True, samples=8)
    ao_geo.inputs["Distance"].default_value = 0.06
    cav = t.math("MAXIMUM", t.math("SUBTRACT", 1.0, orm.outputs["Red"]), t.math("SUBTRACT", 1.0, ao_geo.outputs["AO"]))
    cav_cfg = wear.get("cavity", {})
    darken = t.math("SUBTRACT", 1.0, t.math("MULTIPLY", cav, cav_cfg.get("darken", 0.0)))
    base = t.mix_color(1.0, base, _gray(t, darken), blend="MULTIPLY")
    rough = t.math("ADD", rough, t.math("MULTIPLY", cav, cav_cfg.get("roughness", 0.0)), clamp=True)

    # dirt: up-facing dust, a band above the object's floor, cavities, grime blotches
    g = dirt.get("gravity", {})
    nz = t.node("ShaderNodeSeparateXYZ")
    t.link(geo, "Normal", nz, "Vector")
    up = t.math("MULTIPLY", t.map_range(nz.outputs["Z"], 0.35, 1.0), g.get("up", 0.0))
    oz = t.node("ShaderNodeSeparateXYZ")
    t.link(coord, "Object", oz, "Vector")
    bottom_m = g.get("bottomM", 0.0)
    band = t.math("SUBTRACT", 1.0, t.map_range(oz.outputs["Z"], 0.0, max(bottom_m, 1e-4))) if bottom_m > 0 else _value(t, 0.0)
    band = t.math("MULTIPLY", band, 1.0 - 0.5 * g.get("falloff", 0.5))
    cav_dirt = t.math("MULTIPLY", cav, dirt.get("cavity", 0.0))
    grime = t.mix_float(dirt.get("grime", 0.0), 1.0, t.math("MULTIPLY", var_rgb.outputs["Blue"], 2.0))
    dirt_mask = t.math("MAXIMUM", t.math("MAXIMUM", up, band), cav_dirt)
    dirt_mask = t.math("MULTIPLY", t.math("MULTIPLY", dirt_mask, grime), t.math("MULTIPLY", dirt_amt, 2.0), clamp=True)
    base = t.mix_color(dirt_mask, base, _rgb(t, srgb_hex_to_linear(dirt["color"])))
    rough = t.mix_float(dirt_mask, rough, dirt.get("roughness", 0.9))
    metal = t.mix_float(dirt_mask, metal, 0.0)

    bsdf = t.node("ShaderNodeBsdfPrincipled")
    t.nt.links.new(base, bsdf.inputs["Base Color"])
    t.nt.links.new(rough, bsdf.inputs["Roughness"])
    t.nt.links.new(metal, bsdf.inputs["Metallic"])
    bsdf.inputs["IOR"].default_value = pbr.get("ior", 1.5)
    nmap = t.node("ShaderNodeNormalMap", space="TANGENT")
    nmap.inputs["Strength"].default_value = pbr.get("normalScale", 1.0)
    nrm_color = nrm_t.outputs["Color"]
    det = p.get("detail")
    if det:
        # whiteout blend in tangent space (library.conventions.detail): n = normalize(nb.xy + s * nd.xy, nb.z * nd.z)
        dmap = t.node("ShaderNodeMapping", vector_type="POINT")
        ds = 1.0 / det["sizeM"]
        dmap.inputs["Scale"].default_value = (ds, ds, 1.0)
        t.link(coord, "UV", dmap, "Vector")
        det_t = _tex(t, _image(decoded_png(files[det["texture"]], shas[det["texture"]]), True), dmap.outputs["Vector"])

        def unpack(color):
            v = t.node("ShaderNodeVectorMath", operation="MULTIPLY_ADD")
            t.nt.links.new(color, v.inputs[0])
            v.inputs[1].default_value = (2.0, 2.0, 2.0)
            v.inputs[2].default_value = (-1.0, -1.0, -1.0)
            sep = t.node("ShaderNodeSeparateXYZ")
            t.nt.links.new(v.outputs["Vector"], sep.inputs["Vector"])
            return sep

        nb, nd = unpack(nrm_color), unpack(det_t.outputs["Color"])
        comb = t.node("ShaderNodeCombineXYZ")
        for axis in ("X", "Y"):
            t.nt.links.new(t.math("ADD", nb.outputs[axis], t.math("MULTIPLY", nd.outputs[axis], det.get("strength", 1.0))), comb.inputs[axis])
        t.nt.links.new(t.math("MULTIPLY", nb.outputs["Z"], nd.outputs["Z"]), comb.inputs["Z"])
        norm = t.node("ShaderNodeVectorMath", operation="NORMALIZE")
        t.link(comb, "Vector", norm, 0)
        pack = t.node("ShaderNodeVectorMath", operation="MULTIPLY_ADD")
        t.link(norm, "Vector", pack, 0)
        pack.inputs[1].default_value = (0.5, 0.5, 0.5)
        pack.inputs[2].default_value = (0.5, 0.5, 0.5)
        nrm_color = pack.outputs["Vector"]
    t.nt.links.new(nrm_color, nmap.inputs["Color"])
    t.link(nmap, "Normal", bsdf, "Normal")
    if "anisotropy" in pbr:
        bsdf.inputs["Anisotropic"].default_value = pbr["anisotropy"]["strength"]
        bsdf.inputs["Anisotropic Rotation"].default_value = pbr["anisotropy"].get("rotation", 0.0)
        tan = t.node("ShaderNodeTangent", direction_type="UV_MAP")
        t.link(tan, "Tangent", bsdf, "Tangent")
    if "sheen" in pbr:
        bsdf.inputs["Sheen Weight"].default_value = 1.0
        bsdf.inputs["Sheen Roughness"].default_value = pbr["sheen"].get("roughness", 0.5)
        sheen = t.mix_color(pbr["sheen"].get("colorFromTint", 0.5), _rgb(t, (0.5, 0.5, 0.5)), tint_c)
        t.nt.links.new(sheen, bsdf.inputs["Sheen Tint"])
    if pbr.get("transmission"):
        bsdf.inputs["Transmission Weight"].default_value = pbr["transmission"]
    shader = bsdf.outputs["BSDF"]
    if pbr.get("diffuseTransmission"):
        tr = t.node("ShaderNodeBsdfTranslucent")
        t.nt.links.new(base, tr.inputs["Color"])
        mix = t.node("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = pbr["diffuseTransmission"]
        t.nt.links.new(shader, mix.inputs[1])
        t.link(tr, "BSDF", mix, 2)
        shader = mix.outputs["Shader"]
    out = t.node("ShaderNodeOutputMaterial")
    t.nt.links.new(shader, out.inputs["Surface"])
    return mat


def _gray(t: Tree, value_socket):
    c = t.node("ShaderNodeCombineColor")
    for k in ("Red", "Green", "Blue"):
        t.nt.links.new(value_socket, c.inputs[k])
    return c.outputs["Color"]


PHI_FRAC = 0.6180339887498949
SQRT2_FRAC = 0.4142135623730951


def seed_offset(seed: int) -> tuple[float, float]:
    """The variation-mask offset of an instance seed, mod 1 (library.conventions.variation).

    Exact for any integer seed 0..2^32-1: the product is formed in float64 (53-bit mantissa) and wrapped here, so the
    shader only ever sees values in [0, 1). tools/materials/checks.mjs seedOffset() is the same function in JS.
    """
    s = int(seed)
    if s < 0 or s > 2**32 - 1:
        raise ValueError(f"seed {seed} outside 0..2^32-1")
    return (s * PHI_FRAC) % 1.0, (s * SQRT2_FRAC) % 1.0


def jitter(e: dict, rgb: tuple, seed: int) -> tuple:
    """Deterministic per-instance hue/saturation/value spread from tint.jitter (seed 0 = no jitter)."""
    j = e["params"].get("tint", {}).get("jitter", {})
    if not seed or not j:
        return rgb
    rnd = random.Random(f"{e['id']}:{seed}")
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    h = (h + rnd.uniform(-1, 1) * j.get("hue", 0.0)) % 1.0
    s = min(max(s * (1 + rnd.uniform(-1, 1) * j.get("saturation", 0.0)), 0.0), 1.0)
    v = min(max(v * (1 + rnd.uniform(-1, 1) * j.get("value", 0.0)), 0.0), 1.0)
    return colorsys.hsv_to_rgb(h, s, v)


def assign(obj: bpy.types.Object, material_id: str, tint=None, tint2=None, wear: float = 0.0, dirt: float | None = None, seed: int = 0, use: str | None = None) -> None:
    """Puts the library material on obj and stores the per-instance parameters on it (seed also jitters the tint).

    use ('floor', 'wall', 'furniture', 'accent') makes a preset restricted by params.tint.presetUse raise."""
    e = entry(material_id)
    if use is not None:
        check_use(e, tint, use)
    mat = material(material_id)
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    obj["sl_set"] = 1.0
    obj["sl_tint"] = list(jitter(e, resolve_tint(e, tint), seed))
    obj["sl_tint2"] = list(resolve_tint(e, tint2, secondary=True))
    obj["sl_wear"] = float(wear)
    obj["sl_dirt"] = float(e["params"].get("dirt", {}).get("amount", 0.0) if dirt is None else dirt)
    obj["sl_seed"] = float(seed)
    obj["sl_seed_u"], obj["sl_seed_v"] = seed_offset(seed)
