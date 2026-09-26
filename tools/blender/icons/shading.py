"""Materials for the icon subjects: printed labels, plastics, PET and water, paper, ceramic glaze, raw pine, gauze
and the food shaders. Procedural textures only (Blender's noise, Voronoi and wave textures are fixed functions of
position, so renders repeat exactly); the label art is the rasterised output of labels.mjs.

Colours are given as sRGB hex and converted to linear for the shader inputs.
"""

from __future__ import annotations

import os

import bpy

from common.nodes import Tree, new_material

LABEL_DIR: str = ""


def lin(h: str) -> tuple[float, float, float, float]:
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def _new(name: str):
    mat, nt = new_material(name)
    nt.nodes.clear()
    t = Tree(nt)
    out = t.node("ShaderNodeOutputMaterial")
    return mat, t, out


def _bsdf(t: Tree, **inputs):
    b = t.node("ShaderNodeBsdfPrincipled")
    for k, v in inputs.items():
        key = k.replace("_", " ")
        sock = b.inputs[key]
        if hasattr(v, "is_output"):
            t.nt.links.new(v, sock)
        elif isinstance(v, str):
            sock.default_value = lin(v)
        else:
            sock.default_value = v
    return b


def assign(ob: bpy.types.Object, mat: bpy.types.Material) -> bpy.types.Object:
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


def _coord(t: Tree, kind: str = "Object", scale: float = 1.0):
    tc = t.node("ShaderNodeTexCoord")
    if scale == 1.0:
        return tc.outputs[kind]
    m = t.node("ShaderNodeMapping", vector_type="POINT")
    m.inputs["Scale"].default_value = (scale, scale, scale)
    t.link(tc, kind, m, "Vector")
    return m.outputs["Vector"]


def _noise(t: Tree, vec, scale: float, detail: float = 4.0, rough: float = 0.55, distortion: float = 0.0, dims: str = "3D"):
    n = t.node("ShaderNodeTexNoise", noise_dimensions=dims)
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    n.inputs["Distortion"].default_value = distortion
    t.nt.links.new(vec, n.inputs["Vector"])
    return n


def _bump(t: Tree, height, strength: float, distance: float = 0.001, normal=None):
    b = t.node("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = distance
    t.nt.links.new(height, b.inputs["Height"])
    if normal is not None:
        t.nt.links.new(normal, b.inputs["Normal"])
    return b.outputs["Normal"]


def _ramp(t: Tree, fac, stops: list[tuple[float, str]], interp: str = "LINEAR"):
    r = t.node("ShaderNodeValToRGB")
    cr = r.color_ramp
    cr.interpolation = interp
    while len(cr.elements) > len(stops):
        cr.elements.remove(cr.elements[-1])
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for el, (pos, col) in zip(cr.elements, stops):
        el.position = pos
        el.color = lin(col)
    t.nt.links.new(fac, r.inputs["Fac"])
    return r.outputs["Color"]


def _image(path: str, data: bool):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "Non-Color" if data else "sRGB"
    img.alpha_mode = "CHANNEL_PACKED"
    return img


def _label_tex(t: Tree, label: str, uv_map: str = "label", extension: str = "REPEAT"):
    """(colour output, alpha output, separated mask node) of a label from labels.mjs. Wrap labels repeat around
    (their u runs past 1); patches clip."""
    if not LABEL_DIR:
        raise RuntimeError("shading.LABEL_DIR is not set")
    cpath = os.path.join(LABEL_DIR, f"{label}.png")
    mpath = os.path.join(LABEL_DIR, f"{label}.mask.png")
    for p in (cpath, mpath):
        if not os.path.exists(p):
            raise SystemExit(f"label art {p} is missing: run node tools/blender/icons/labels.mjs")
    uv = t.node("ShaderNodeUVMap", uv_map=uv_map)
    ct = t.node("ShaderNodeTexImage", image=_image(cpath, False), interpolation="Cubic", extension=extension)
    mt = t.node("ShaderNodeTexImage", image=_image(mpath, True), interpolation="Cubic", extension=extension)
    t.link(uv, "UV", ct, "Vector")
    t.link(uv, "UV", mt, "Vector")
    sep = t.node("ShaderNodeSeparateColor")
    t.link(mt, "Color", sep, "Color")
    return ct.outputs["Color"], ct.outputs["Alpha"], sep


def label(name: str, label_id: str, uv_map: str = "label", print_bump: float = 0.04, substrate: bpy.types.Material | None = None,
          extension: str = "REPEAT", sheen: float = 0.0):
    """A printed label: colour from the art, metalness from mask R, roughness from mask G, a clear coat from mask B
    (varnish or plastic film). Where the art is transparent the substrate shader shows (paper white by default)."""
    mat, t, out = _new(name)
    col, alpha, sep = _label_tex(t, label_id, uv_map, extension)
    grain = _noise(t, _coord(t, "Object"), 900.0, 2.0, 0.5)
    nrm = _bump(t, grain.outputs["Fac"], print_bump, 0.0002)
    b = _bsdf(t, Roughness=0.5)
    t.nt.links.new(col, b.inputs["Base Color"])
    t.link(sep, "Red", b, "Metallic")
    t.link(sep, "Green", b, "Roughness")
    t.link(sep, "Blue", b, "Coat Weight")
    b.inputs["Coat Roughness"].default_value = 0.08
    b.inputs["Coat IOR"].default_value = 1.5
    if sheen:
        b.inputs["Sheen Weight"].default_value = sheen
        b.inputs["Sheen Roughness"].default_value = 0.3
        b.inputs["Sheen Tint"].default_value = (1.0, 0.93, 0.88, 1.0)
    t.nt.links.new(nrm, b.inputs["Normal"])
    shader = b.outputs["BSDF"]
    if substrate is not None:
        sub = _embed(t, substrate)
        mix = t.node("ShaderNodeMixShader")
        t.nt.links.new(alpha, mix.inputs["Fac"])
        t.nt.links.new(sub, mix.inputs[1])
        t.nt.links.new(shader, mix.inputs[2])
        shader = mix.outputs["Shader"]
    t.nt.links.new(shader, out.inputs["Surface"])
    return mat


def _embed(t: Tree, mat: bpy.types.Material):
    """Copies another material's node tree into a group and returns its shader output (for label substrates)."""
    ng = bpy.data.node_groups.new(f"G_{mat.name}", "ShaderNodeTree")
    ng.interface.new_socket("Shader", in_out="OUTPUT", socket_type="NodeSocketShader")
    src = mat.node_tree
    mapping = {}
    for n in src.nodes:
        if n.type == "OUTPUT_MATERIAL":
            continue
        c = ng.nodes.new(n.bl_idname)
        for attr in ("operation", "blend_type", "data_type", "interpolation_type", "noise_dimensions", "voronoi_dimensions",
                     "feature", "distance", "wave_type", "bands_direction", "rings_direction", "wave_profile", "vector_type",
                     "uv_map", "interpolation", "extension", "image", "space", "attribute_type", "attribute_name",
                     "use_clamp", "clamp", "normalize", "direction_type", "axis", "invert", "samples", "only_local",
                     "subsurface_method", "distribution", "falloff"):
            if hasattr(n, attr):
                try:
                    setattr(c, attr, getattr(n, attr))
                except (AttributeError, TypeError, ValueError):
                    pass
        if n.type == "VALTORGB":
            cr, sr = c.color_ramp, n.color_ramp
            cr.interpolation = sr.interpolation
            while len(cr.elements) < len(sr.elements):
                cr.elements.new(0.5)
            for a, b in zip(cr.elements, sr.elements):
                a.position, a.color = b.position, tuple(b.color)
        for i, s in enumerate(n.inputs):
            if hasattr(s, "default_value") and i < len(c.inputs):
                try:
                    c.inputs[i].default_value = s.default_value
                except (AttributeError, TypeError, ValueError):
                    pass
        for i, s in enumerate(n.outputs):
            if hasattr(s, "default_value") and i < len(c.outputs):
                try:
                    c.outputs[i].default_value = s.default_value
                except (AttributeError, TypeError, ValueError):
                    pass
        mapping[n.name] = c
    gout = ng.nodes.new("NodeGroupOutput")
    for l in src.links:
        if l.to_node.type == "OUTPUT_MATERIAL":
            if l.to_socket.name == "Surface":
                ng.links.new(mapping[l.from_node.name].outputs[l.from_socket.identifier], gout.inputs[0])
            continue
        a, b = mapping.get(l.from_node.name), mapping.get(l.to_node.name)
        if a is None or b is None:
            continue
        ng.links.new(a.outputs[l.from_socket.identifier], b.inputs[l.to_socket.identifier])
    g = t.node("ShaderNodeGroup")
    g.node_tree = ng
    return g.outputs[0]


def plastic(name: str, color: str, rough: float = 0.35, coat: float = 0.0, sss: float = 0.0, bump: float = 0.0, bump_scale: float = 400.0,
            sheen: float = 0.0):
    mat, t, out = _new(name)
    b = _bsdf(t, **{"Base Color": color, "Roughness": rough, "Coat Weight": coat, "Coat Roughness": 0.1, "Subsurface Weight": sss,
                    "Sheen Weight": sheen, "Sheen Roughness": 0.3})
    if sss:
        b.inputs["Subsurface Radius"].default_value = (1.0, 0.6, 0.4)
        b.inputs["Subsurface Scale"].default_value = 0.004
    if bump:
        n = _noise(t, _coord(t), bump_scale, 3.0, 0.5)
        t.nt.links.new(_bump(t, n.outputs["Fac"], bump, 0.0005), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def metal(name: str, color: str, rough: float = 0.25, aniso: float = 0.0, bump: float = 0.0):
    mat, t, out = _new(name)
    b = _bsdf(t, **{"Base Color": color, "Metallic": 1.0, "Roughness": rough, "Anisotropic": aniso})
    if bump:
        n = _noise(t, _coord(t), 600.0, 3.0, 0.6)
        t.nt.links.new(_bump(t, n.outputs["Fac"], bump, 0.0003), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def pet(name: str, tint: str = "#eef6fb", rough: float = 0.03, ior: float = 1.57):
    """Clear PET: thin-walled transmission with a faint blue tint."""
    mat, t, out = _new(name)
    b = _bsdf(t, **{"Base Color": tint, "Roughness": rough, "IOR": ior, "Transmission Weight": 1.0})
    t.link(b, "BSDF", out, "Surface")
    return mat


def clear_body(name: str, body: str = "#a9d4ea", air: str | None = None, water_z: float | None = None, rough: float = 0.06, glow: float = 0.22):
    """The icon rule for clear plastic and glass (WP-P0-12 review 1): an opaque, light, cool body with bright
    speculars. A see-through bottle takes on whatever tile it sits on and goes dark on --ui-panel, so the body is
    drawn as the bright liquid a studio shot shows: a pale translucent colour (`body`; `air` above object z
    `water_z`, for the empty neck), lighter at grazing angles like refracted studio light, under a glossy clear coat.
    A faint emission of the body colour (`glow`) stands in for the light a clear body carries through from its lit
    side, so its shadow side stays light. Alpha stays opaque inside the outline, and the coat is kept light so the dark studio floor does not draw a dark
    rim that merges with a dark tile."""
    mat, t, out = _new(name)
    col = lin(body)
    if air and water_z is not None:
        above = t.map_range(_object_z(t), water_z - 0.0015, water_z + 0.0015)
        colv = t.mix_color(above, col, lin(air))
    else:
        colv = None
    lw = t.node("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    rim = t.map_range(lw.outputs["Facing"], 0.35, 1.0)
    b = _bsdf(t, **{"Roughness": rough, "Subsurface Weight": 0.6, "Coat Weight": 0.35, "Coat Roughness": 0.05, "Coat IOR": 1.45,
                    "Specular IOR Level": 0.35})
    b.inputs["Subsurface Radius"].default_value = (0.6, 0.85, 1.0)
    b.inputs["Subsurface Scale"].default_value = 0.01
    base = colv if colv is not None else _rgb_socket(t, col)
    lit = t.mix_color(t.math("MULTIPLY", rim, 0.7), base, lin("#e4f0f6"))
    t.nt.links.new(lit, b.inputs["Base Color"])
    t.nt.links.new(lit, b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = glow
    t.link(b, "BSDF", out, "Surface")
    return mat


def _rgb_socket(t: Tree, rgba):
    n = t.node("ShaderNodeRGB")
    n.outputs[0].default_value = rgba
    return n.outputs[0]


def thin_glass(name: str, tint: str = "#f2f8fb", ior: float = 1.57, rough: float = 0.04, milk: str | None = None, milk_amount: float = 0.0):
    """A thin clear wall (PET, a water column seen through one): transparent where Fresnel lets light through and
    glossy where it reflects. Refraction through a wall this thin is invisible at icon size, and a transparent
    wall passes shadow rays, so the inside of a bottle is lit and the tile shows through it."""
    mat, t, out = _new(name)
    tr = t.node("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = lin(tint)
    gl = t.node("ShaderNodeBsdfGlossy")
    gl.inputs["Roughness"].default_value = rough
    fr = t.node("ShaderNodeFresnel")
    fr.inputs["IOR"].default_value = ior
    mix = t.node("ShaderNodeMixShader")
    t.link(fr, "Fac", mix, "Fac")
    base = tr.outputs["BSDF"]
    if milk and milk_amount > 0:
        tl = t.node("ShaderNodeBsdfTranslucent")
        tl.inputs["Color"].default_value = lin(milk)
        m2 = t.node("ShaderNodeMixShader")
        m2.inputs["Fac"].default_value = milk_amount
        t.nt.links.new(base, m2.inputs[1])
        t.link(tl, "BSDF", m2, 2)
        base = m2.outputs["Shader"]
    t.nt.links.new(base, mix.inputs[1])
    t.link(gl, "BSDF", mix, 2)
    t.link(mix, "Shader", out, "Surface")
    return mat


def water(name: str, tint: str = "#e8f4fa", milk: str | None = None, milk_amount: float = 0.0, ior: float = 1.333):
    """Water: a clear refracting surface; `milk` mixes in a little translucent colour that the lights pick up, so a
    clear bottle still reads as water on a dark tile."""
    mat, t, out = _new(name)
    b = _bsdf(t, **{"Base Color": tint, "Roughness": 0.0, "IOR": ior, "Transmission Weight": 1.0})
    shader = b.outputs["BSDF"]
    if milk and milk_amount > 0:
        tr = t.node("ShaderNodeBsdfTranslucent")
        tr.inputs["Color"].default_value = lin(milk)
        mix = t.node("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = milk_amount
        t.nt.links.new(shader, mix.inputs[1])
        t.link(tr, "BSDF", mix, 2)
        shader = mix.outputs["Shader"]
    t.nt.links.new(shader, out.inputs["Surface"])
    return mat


def _gray(t: Tree, value):
    c = t.node("ShaderNodeCombineColor")
    for k in ("Red", "Green", "Blue"):
        t.nt.links.new(value, c.inputs[k])
    return c.outputs["Color"]


def paper(name: str, color: str = "#dcd8cc", rough: float = 0.82, fibre: float = 0.08):
    mat, t, out = _new(name)
    n = _noise(t, _coord(t), 1500.0, 2.0, 0.6)
    b = _bsdf(t, **{"Base Color": color, "Roughness": rough, "Subsurface Weight": 0.05})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.9, 0.8)
    b.inputs["Subsurface Scale"].default_value = 0.001
    t.nt.links.new(_bump(t, n.outputs["Fac"], fibre, 0.0002), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def ceramic(name: str, glaze: str = "#d9d5cb", rim: str | None = None, rim_r: tuple[float, float] = (0.1, 0.105)):
    """Glazed stoneware: glossy white with a coat; an optional coloured line between two radii (metres from the
    object's axis) on the upper side."""
    mat, t, out = _new(name)
    base = lin(glaze)
    col = None
    if rim:
        sep = t.node("ShaderNodeSeparateXYZ")
        t.nt.links.new(_coord(t, "Object"), sep.inputs["Vector"])
        r = t.math("SQRT", t.math("ADD", t.math("MULTIPLY", sep.outputs["X"], sep.outputs["X"]), t.math("MULTIPLY", sep.outputs["Y"], sep.outputs["Y"])))
        e = 0.0004
        band = t.math("MULTIPLY", t.map_range(r, rim_r[0] - e, rim_r[0] + e), t.math("SUBTRACT", 1.0, t.map_range(r, rim_r[1] - e, rim_r[1] + e)))
        band = t.math("MULTIPLY", band, t.map_range(_normal_z(t), -0.1, 0.2))
        col = t.mix_color(band, base, lin(rim))
    b = _bsdf(t, **{"Roughness": 0.12, "Coat Weight": 0.6, "Coat Roughness": 0.04, "Subsurface Weight": 0.08})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.95, 0.9)
    b.inputs["Subsurface Scale"].default_value = 0.002
    if col is not None:
        t.nt.links.new(col, b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = base
    n = _noise(t, _coord(t), 60.0, 2.0, 0.5)
    t.nt.links.new(_bump(t, n.outputs["Fac"], 0.02, 0.001), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def pine(name: str, light: str = "#dcb883", dark: str = "#b98a4e", end_grain: bool = False, scale: float = 1.0, axis: str = "X",
         seed: int = 0, knots: float = 0.0, contrast: float = 0.0):
    """Raw sawn pine: growth rings around an axis running along the board (object X) and centred below it, so the
    faces show flat-sawn grain and the sawn ends show arcs of rings; noise warps them, latewood lines are darker, a
    fine texture gives the saw finish. `seed` moves the pith so boards differ; `knots` sets how dark the sparse knots
    are (0 none); `contrast` widens the latewood lines; end grain is darker, as sawn ends drink in the light."""
    mat, t, out = _new(name)
    co = _coord(t, "Object")
    m = t.node("ShaderNodeMapping", vector_type="POINT")
    if axis == "X":
        m.inputs["Rotation"].default_value = (0.0, 1.5708, 0.0)
    t.nt.links.new(co, m.inputs["Vector"])
    k = (seed * 0.6180339) % 1.0
    m.inputs["Location"].default_value = ((0.03 + 0.05 * k) * scale, (-0.06 - 0.05 * ((seed * 0.4142136) % 1.0)) * scale, 0.37 * k)
    v = m.outputs["Vector"]
    warp = _noise(t, v, 6.0 / scale, 3.0, 0.5)
    wv = t.node("ShaderNodeVectorMath", operation="ADD")
    t.nt.links.new(v, wv.inputs[0])
    sc = t.node("ShaderNodeVectorMath", operation="SCALE")
    sc.inputs["Scale"].default_value = 0.012 * scale
    t.link(warp, "Color", sc, 0)
    t.nt.links.new(sc.outputs["Vector"], wv.inputs[1])
    wave = t.node("ShaderNodeTexWave", wave_type="RINGS", rings_direction="Z", wave_profile="SAW")
    wave.inputs["Scale"].default_value = 55.0 / scale
    wave.inputs["Distortion"].default_value = 1.5
    wave.inputs["Detail"].default_value = 2.0
    wave.inputs["Detail Scale"].default_value = 1.0
    t.nt.links.new(wv.outputs["Vector"], wave.inputs["Vector"])
    late = t.map_range(wave.outputs["Fac"], 0.72 - 0.12 * contrast, 0.98)
    fine = _noise(t, v, 240.0 / scale, 4.0, 0.6)
    col = _ramp(t, late, [(0.0, light), (1.0, dark)])
    col = t.mix_color(0.18, col, fine.outputs["Color"], blend="OVERLAY")
    if knots > 0:
        km = t.node("ShaderNodeMapping", vector_type="POINT")
        km.inputs["Scale"].default_value = (10.0 / scale, 10.0 / scale, 5.5 / scale)
        km.inputs["Location"].default_value = (0.7 * k, 1.3 * k, 0.0)
        t.nt.links.new(wv.outputs["Vector"], km.inputs["Vector"])
        kd = _voronoi(t, km.outputs["Vector"], 1.0).outputs["Distance"]
        core = t.math("SUBTRACT", 1.0, t.map_range(kd, 0.05, 0.1))
        halo = t.math("MULTIPLY", t.math("SUBTRACT", 1.0, t.map_range(kd, 0.1, 0.17)), 0.45)
        col = t.mix_color(t.math("MULTIPLY", t.math("MAXIMUM", core, halo), knots), col, lin("#4d2a12"))
    if end_grain:
        col = t.mix_color(1.0, col, (0.6, 0.52, 0.44, 1.0) if contrast else (0.8, 0.76, 0.7, 1.0), blend="MULTIPLY")
    b = _bsdf(t, Roughness=0.82 if end_grain else 0.72, **{"Subsurface Weight": 0.04})
    t.nt.links.new(col, b.inputs["Base Color"])
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.7, 0.4)
    b.inputs["Subsurface Scale"].default_value = 0.002
    h = t.math("ADD", t.math("MULTIPLY", late, 0.4), t.math("MULTIPLY", fine.outputs["Fac"], 0.6))
    t.nt.links.new(_bump(t, h, 0.25, 0.0006), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def _voronoi(t: Tree, vec, scale: float, feature: str = "F1", randomness: float = 1.0):
    v = t.node("ShaderNodeTexVoronoi", voronoi_dimensions="3D", feature=feature)
    v.inputs["Scale"].default_value = scale
    v.inputs["Randomness"].default_value = randomness
    t.nt.links.new(vec, v.inputs["Vector"])
    return v


def _normal_z(t: Tree):
    geo = t.node("ShaderNodeNewGeometry")
    sep = t.node("ShaderNodeSeparateXYZ")
    t.link(geo, "Normal", sep, "Vector")
    return sep.outputs["Z"]


def _object_z(t: Tree):
    sep = t.node("ShaderNodeSeparateXYZ")
    t.nt.links.new(_coord(t, "Object"), sep.inputs["Vector"])
    return sep.outputs["Z"]


def decal(name: str, label_id: str, rough: float = 0.85, uv_map: str = "label"):
    """Printed ink on another surface (a thin shell or plane above it): the label colour where the art has ink,
    fully transparent elsewhere."""
    mat, t, out = _new(name)
    col, alpha, sep = _label_tex(t, label_id, uv_map, "CLIP")
    b = _bsdf(t, Roughness=rough)
    t.nt.links.new(col, b.inputs["Base Color"])
    t.link(sep, "Green", b, "Roughness")
    t.nt.links.new(alpha, b.inputs["Alpha"])
    n = _noise(t, _coord(t), 700.0, 3.0, 0.6)
    t.nt.links.new(_bump(t, n.outputs["Fac"], 0.15, 0.0003), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def two_sided(name: str, front: bpy.types.Material, back: bpy.types.Material):
    """Front faces with one material, back faces with another (a peeled lid: print outside, foil inside)."""
    mat, t, out = _new(name)
    geo = t.node("ShaderNodeNewGeometry")
    mix = t.node("ShaderNodeMixShader")
    t.link(geo, "Backfacing", mix, "Fac")
    t.nt.links.new(_embed(t, front), mix.inputs[1])
    t.nt.links.new(_embed(t, back), mix.inputs[2])
    t.link(mix, "Shader", out, "Surface")
    return mat


def foil(name: str, color: str = "#d9dadb", rough: float = 0.22, metal: float = 1.0):
    """Aluminium foil laminate: metallic with crinkle bumps (metal < 1 for a lacquered or paper-backed foil that also
    scatters light)."""
    mat, t, out = _new(name)
    b = _bsdf(t, **{"Base Color": color, "Metallic": metal, "Roughness": rough})
    n = _noise(t, _coord(t), 180.0, 4.0, 0.7, distortion=0.4)
    t.nt.links.new(_bump(t, n.outputs["Fac"], 0.25, 0.0004), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def crust(name: str, light: str = "#d49a4e", dark: str = "#9a5a24", top_bias: float = 0.72):
    """Baked bread crust: an even golden bake, browner on top, with soft broad variation and faint blisters (not
    streaky bark), a light egg-wash sheen on top."""
    mat, t, out = _new(name)
    co = _coord(t)
    nz = _normal_z(t)
    bake = t.map_range(nz, -0.2, 0.9, 0.0, top_bias)
    n1 = _noise(t, co, 9.0, 2.0, 0.5)
    n2 = _noise(t, co, 90.0, 3.0, 0.55)
    blister = t.map_range(n2.outputs["Fac"], 0.55, 0.72)
    f = t.math("ADD", bake, t.math("MULTIPLY", t.math("SUBTRACT", n1.outputs["Fac"], 0.5), 0.25), clamp=True)
    f = t.math("ADD", f, t.math("MULTIPLY", blister, 0.08), clamp=True)
    col = _ramp(t, f, [(0.0, "#e2bd7e"), (0.3, light), (0.75, dark), (1.0, "#6a3816")])
    rough = t.map_range(nz, 0.3, 0.95, 0.72, 0.48)
    b = _bsdf(t, **{"Subsurface Weight": 0.15, "Coat Weight": 0.15, "Coat Roughness": 0.35})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.55, 0.25)
    b.inputs["Subsurface Scale"].default_value = 0.004
    t.nt.links.new(col, b.inputs["Base Color"])
    t.nt.links.new(rough, b.inputs["Roughness"])
    fine = _noise(t, co, 400.0, 3.0, 0.6)
    h = t.math("ADD", t.math("MULTIPLY", blister, 0.6), t.math("MULTIPLY", fine.outputs["Fac"], 0.4))
    t.nt.links.new(_bump(t, h, 0.2, 0.001), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def crumb(name: str, color: str = "#d9cba9"):
    """Bread crumb: soft off-white with open pores (Voronoi cells) and a fine fibrous bump."""
    mat, t, out = _new(name)
    co = _coord(t)
    v = _voronoi(t, co, 260.0)
    pores = t.math("SUBTRACT", 1.0, t.map_range(v.outputs["Distance"], 0.05, 0.3))
    v2 = _voronoi(t, co, 90.0)
    big = t.math("SUBTRACT", 1.0, t.map_range(v2.outputs["Distance"], 0.02, 0.16))
    holes = t.math("MAXIMUM", t.math("MULTIPLY", pores, 0.7), t.math("MULTIPLY", big, 0.55))
    col = t.mix_color(holes, lin(color), lin("#cdb58a"))
    b = _bsdf(t, **{"Roughness": 0.92, "Subsurface Weight": 0.25})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.8, 0.55)
    b.inputs["Subsurface Scale"].default_value = 0.003
    t.nt.links.new(col, b.inputs["Base Color"])
    t.nt.links.new(_bump(t, t.math("SUBTRACT", 1.0, holes), 0.6, 0.0012), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def egg_white(name: str, lace: float = 0.0, burn: float = 0.0):
    """Fried egg white: glossy, faintly translucent; `lace` browns and crisps the thin rim (0 = clean edge), `burn`
    scorches it from the rim inwards."""
    mat, t, out = _new(name)
    co = _coord(t)
    attr = t.node("ShaderNodeAttribute", attribute_type="GEOMETRY", attribute_name="edge")
    n = _noise(t, co, 60.0, 5.0, 0.65)
    lo = 0.55 - 0.5 * burn
    edge = t.math("MULTIPLY", t.map_range(t.math("ADD", attr.outputs["Fac"], t.math("MULTIPLY", n.outputs["Fac"], 0.35)), lo, 1.05), lace)
    stops = [(0.0, "#dcd8ca"), (0.35, "#d8c08a"), (0.7, "#c08440"), (1.0, "#7e4a1f")]
    if burn > 0.5:
        stops = [(0.0, "#e9dcc0"), (0.25, "#b98646"), (0.6, "#5e3614"), (1.0, "#1f140c")]
    col = _ramp(t, edge, stops)
    b = _bsdf(t, **{"Roughness": 0.18, "Subsurface Weight": 0.35, "Coat Weight": 0.3, "Coat Roughness": 0.1})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.95, 0.85)
    b.inputs["Subsurface Scale"].default_value = 0.003
    t.nt.links.new(col, b.inputs["Base Color"])
    t.nt.links.new(t.math("ADD", 0.18, t.math("MULTIPLY", edge, 0.5)), b.inputs["Roughness"])
    bump_n = _noise(t, co, 140.0, 4.0, 0.6)
    t.nt.links.new(_bump(t, t.math("ADD", bump_n.outputs["Fac"], t.math("MULTIPLY", edge, 0.8)), 0.3, 0.0008), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def yolk(name: str, color: str = "#f4a21a", gloss: float = 1.0):
    mat, t, out = _new(name)
    b = _bsdf(t, **{"Base Color": color, "Roughness": 0.35 - 0.25 * gloss, "Subsurface Weight": 0.5, "Coat Weight": 0.6 * gloss, "Coat Roughness": 0.05})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.45, 0.12)
    b.inputs["Subsurface Scale"].default_value = 0.004
    n = _noise(t, _coord(t), 80.0, 2.0, 0.5)
    t.nt.links.new(_bump(t, n.outputs["Fac"], 0.08 + 0.2 * (1 - gloss), 0.0006), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def luncheon(name: str, sear: float = 0.7, char: float = 0.1, gloss: float = 0.5, burn: float = 0.0):
    """Pan-fried luncheon meat: meat-pink flecked with fat, the flat faces seared golden-brown by `sear` and the cut
    edges browned about half as much, with darker spots by `char`, an oily sheen by `gloss`; `burn` blackens the
    char and darkens the cut edges."""
    mat, t, out = _new(name)
    co = _coord(t)
    nz = t.math("ABSOLUTE", _normal_z(t))
    flat = t.map_range(nz, 0.55, 0.9)
    n = _noise(t, co, 55.0, 5.0, 0.6)
    n2 = _noise(t, co, 160.0, 3.0, 0.6)
    s = t.math("MULTIPLY", t.mix_float(flat, 0.55, 1.0), t.math("ADD", sear, t.math("MULTIPLY", t.math("SUBTRACT", n.outputs["Fac"], 0.5), 1.2)), clamp=True)
    charm = t.math("MULTIPLY", flat, t.map_range(n2.outputs["Fac"], 0.62 - 0.25 * char, 0.8 - 0.2 * char), clamp=True)
    charm = t.math("MULTIPLY", charm, char * 2.0, clamp=True)
    fleck = t.map_range(_voronoi(t, co, 480.0).outputs["Distance"], 0.08, 0.02)
    pink = t.mix_color(t.math("MULTIPLY", fleck, 0.6), lin("#c46f62"), lin("#e8b8aa"))
    col = t.mix_color(s, pink, _ramp(t, n.outputs["Fac"], [(0.0, "#b0652c"), (0.6, "#8c4a1d"), (1.0, "#6c3713")]))
    col = t.mix_color(charm, col, lin("#4f2710" if burn < 0.5 else "#1c0f07"))
    if burn > 0:
        col = t.mix_color(burn * 0.55, col, lin("#3a1d0c"))
    b = _bsdf(t, **{"Subsurface Weight": 0.2, "Coat Weight": gloss, "Coat Roughness": 0.15})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.4, 0.3)
    b.inputs["Subsurface Scale"].default_value = 0.003
    t.nt.links.new(col, b.inputs["Base Color"])
    t.nt.links.new(t.math("ADD", 0.42, t.math("MULTIPLY", s, 0.2)), b.inputs["Roughness"])
    t.nt.links.new(_bump(t, t.math("ADD", t.math("MULTIPLY", n2.outputs["Fac"], 0.5), t.math("MULTIPLY", s, 0.5)), 0.35, 0.0008), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def noodle_block(name: str, cooked: bool = False):
    """A dry instant-noodle cake seen from above: layers of tightly crimped strands running in a few directions, the
    top layer lightest, dark gaps between strands; cooked, the strands are softer and glossy in a red braising broth."""
    mat, t, out = _new(name)
    co = _coord(t)
    layers = []
    for k, (ang, scale, dist) in enumerate(((0.45, 150.0, 9.0), (-0.6, 135.0, 11.0), (1.3, 160.0, 8.0))):
        m = t.node("ShaderNodeMapping", vector_type="POINT")
        m.inputs["Rotation"].default_value = (0.0, 0.0, ang)
        m.inputs["Location"].default_value = (0.013 * k, 0.007 * k, 0.0)
        t.nt.links.new(co, m.inputs["Vector"])
        w = t.node("ShaderNodeTexWave", wave_type="BANDS", bands_direction="X", wave_profile="SIN")
        w.inputs["Scale"].default_value = scale
        w.inputs["Distortion"].default_value = dist
        w.inputs["Detail"].default_value = 4.0
        w.inputs["Detail Scale"].default_value = 2.5
        w.inputs["Detail Roughness"].default_value = 0.6
        t.link(m, "Vector", w, "Vector")
        mask = t.map_range(_noise(t, co, 40.0 + 13.0 * k, 2.0, 0.5).outputs["Fac"], 0.42, 0.58)
        layers.append(t.math("MULTIPLY", t.map_range(w.outputs["Fac"], 0.45, 0.9), t.math("ADD", 0.55, t.math("MULTIPLY", mask, 0.45))))
    strand = t.math("MAXIMUM", t.math("MAXIMUM", layers[0], layers[1]), layers[2])
    groove = t.map_range(strand, 0.1, 0.95)
    col = _ramp(t, groove, [(0.0, "#6e2a12"), (0.45, "#c9803c"), (1.0, "#e9bc6c")] if cooked else [(0.0, "#7e5220"), (0.4, "#cf9c4f"), (1.0, "#f1d38e")])
    b = _bsdf(t, **{"Roughness": 0.3 if cooked else 0.55, "Subsurface Weight": 0.3 if cooked else 0.15, "Coat Weight": 0.5 if cooked else 0.0})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.7, 0.3)
    b.inputs["Subsurface Scale"].default_value = 0.002
    t.nt.links.new(col, b.inputs["Base Color"])
    t.nt.links.new(_bump(t, groove, 0.9, 0.0012), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def cheese(name: str):
    mat, t, out = _new(name)
    co = _coord(t)
    v = _voronoi(t, co, 160.0)
    hole = t.math("SUBTRACT", 1.0, t.map_range(v.outputs["Distance"], 0.1, 0.18))
    col = t.mix_color(t.math("MULTIPLY", hole, 0.5), lin("#f0c04c"), lin("#b8861f"))
    b = _bsdf(t, **{"Roughness": 0.5, "Subsurface Weight": 0.4})
    b.inputs["Subsurface Radius"].default_value = (1.0, 0.7, 0.2)
    b.inputs["Subsurface Scale"].default_value = 0.003
    t.nt.links.new(col, b.inputs["Base Color"])
    t.nt.links.new(_bump(t, t.math("SUBTRACT", 1.0, hole), 0.8, 0.001), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def rice(name: str):
    """Steamed rice: translucent white grains (stretched Voronoi cells) with dark seams between them."""
    mat, t, out = _new(name)
    co = _coord(t)
    m = t.node("ShaderNodeMapping", vector_type="POINT")
    m.inputs["Scale"].default_value = (1.0, 2.2, 1.0)
    t.nt.links.new(co, m.inputs["Vector"])
    v = _voronoi(t, m.outputs["Vector"], 260.0, feature="DISTANCE_TO_EDGE")
    seam = t.map_range(v.outputs["Distance"], 0.0, 0.12)
    col = t.mix_color(seam, lin("#a8a193"), lin("#dedbd2"))
    b = _bsdf(t, **{"Roughness": 0.35, "Subsurface Weight": 0.6, "Coat Weight": 0.2})
    b.inputs["Subsurface Radius"].default_value = (1.0, 1.0, 0.9)
    b.inputs["Subsurface Scale"].default_value = 0.003
    t.nt.links.new(col, b.inputs["Base Color"])
    t.nt.links.new(_bump(t, seam, 0.8, 0.0015), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def page_edges(name: str, color: str = "#d8d2c3", lines_per_m: float = 9000.0):
    """The edge of a paper block: fine stacked-sheet lines along object Z."""
    mat, t, out = _new(name)
    z = _object_z(t)
    lines = t.math("ABSOLUTE", t.math("SINE", t.math("MULTIPLY", z, lines_per_m * 3.14159)))
    n = _noise(t, _coord(t), 300.0, 2.0, 0.5)
    shade = t.math("ADD", 0.82, t.math("MULTIPLY", t.math("ADD", t.math("MULTIPLY", lines, 0.7), t.math("MULTIPLY", n.outputs["Fac"], 0.3)), 0.18))
    b = _bsdf(t, Roughness=0.85)
    t.nt.links.new(t.mix_color(1.0, lin(color), _gray(t, shade), blend="MULTIPLY"), b.inputs["Base Color"])
    t.nt.links.new(_bump(t, lines, 0.2, 0.0002), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def cloth(name: str, color: str, rough: float = 0.8, sheen: float = 0.3):
    """Book cloth or ribbon: a matte woven colour with sheen."""
    mat, t, out = _new(name)
    b = _bsdf(t, **{"Base Color": color, "Roughness": rough, "Sheen Weight": sheen, "Sheen Roughness": 0.4})
    n = _noise(t, _coord(t), 900.0, 2.0, 0.5)
    t.nt.links.new(_bump(t, n.outputs["Fac"], 0.15, 0.0002), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def hessian(name: str, color: str = "#b08a58", pitch_m: float = 0.0032):
    """Coarse jute sacking: a plain weave of fuzzy threads at `pitch_m` (exaggerated so it reads at icon size), each
    thread a slightly different tone, dark gaps between them, sheen on the fibres."""
    mat, t, out = _new(name)
    uv = t.node("ShaderNodeUVMap", uv_map="UVMap")
    m = t.node("ShaderNodeMapping", vector_type="POINT")
    m.inputs["Scale"].default_value = (1.0 / pitch_m, 1.0 / pitch_m, 1.0)
    t.link(uv, "UV", m, "Vector")
    sep = t.node("ShaderNodeSeparateXYZ")
    t.link(m, "Vector", sep, "Vector")
    su = t.math("POWER", t.math("ABSOLUTE", t.math("SINE", t.math("MULTIPLY", sep.outputs["X"], 3.14159))), 0.6)
    sv = t.math("POWER", t.math("ABSOLUTE", t.math("SINE", t.math("MULTIPLY", sep.outputs["Y"], 3.14159))), 0.6)
    chk = t.node("ShaderNodeTexChecker")
    chk.inputs["Scale"].default_value = 1.0
    chk.inputs["Color1"].default_value = (1.0, 1.0, 1.0, 1.0)
    chk.inputs["Color2"].default_value = (0.0, 0.0, 0.0, 1.0)
    half = t.node("ShaderNodeMapping", vector_type="POINT")
    half.inputs["Scale"].default_value = (0.5, 0.5, 1.0)
    t.link(m, "Vector", half, "Vector")
    t.link(half, "Vector", chk, "Vector")
    over = chk.outputs["Fac"]
    warp = t.math("MULTIPLY", su, t.mix_float(over, 0.55, 1.0))
    weft = t.math("MULTIPLY", sv, t.mix_float(over, 1.0, 0.55))
    h = t.math("MAXIMUM", warp, weft)
    fl = t.node("ShaderNodeCombineXYZ")
    t.nt.links.new(t.math("FLOOR", sep.outputs["X"]), fl.inputs["X"])
    t.nt.links.new(t.math("FLOOR", sep.outputs["Y"]), fl.inputs["Y"])
    tone = _noise(t, fl.outputs["Vector"], 0.37, 1.0, 0.5)
    big = _noise(t, _coord(t), 9.0, 3.0, 0.6)
    shade = t.math("ADD", 0.45, t.math("MULTIPLY", h, 0.65))
    shade = t.math("MULTIPLY", shade, t.math("ADD", 0.82, t.math("MULTIPLY", tone.outputs["Fac"], 0.36)))
    shade = t.math("MULTIPLY", shade, t.math("ADD", 0.85, t.math("MULTIPLY", big.outputs["Fac"], 0.3)))
    b = _bsdf(t, **{"Roughness": 0.95, "Sheen Weight": 0.6, "Sheen Roughness": 0.35})
    b.inputs["Sheen Tint"].default_value = lin("#e7d2a8")
    t.nt.links.new(t.mix_color(1.0, lin(color), _gray(t, shade), blend="MULTIPLY"), b.inputs["Base Color"])
    fuzz = _noise(t, _coord(t), 2200.0, 2.0, 0.7)
    t.nt.links.new(_bump(t, t.math("ADD", h, t.math("MULTIPLY", fuzz.outputs["Fac"], 0.25)), 0.9, 0.0012), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def gauze_end(name: str, color: str = "#d2cdc0", layer_m: float = 0.0007):
    """The end of a rolled bandage: the wound layers as fine rings around the roll axis (object Z)."""
    mat, t, out = _new(name)
    sep = t.node("ShaderNodeSeparateXYZ")
    t.nt.links.new(_coord(t, "Object"), sep.inputs["Vector"])
    r = t.math("SQRT", t.math("ADD", t.math("MULTIPLY", sep.outputs["X"], sep.outputs["X"]), t.math("MULTIPLY", sep.outputs["Y"], sep.outputs["Y"])))
    n = _noise(t, _coord(t), 300.0, 2.0, 0.5)
    rings = t.math("ABSOLUTE", t.math("SINE", t.math("MULTIPLY", t.math("ADD", r, t.math("MULTIPLY", n.outputs["Fac"], 0.0004)), 3.14159 / layer_m)))
    shade = t.math("ADD", 0.8, t.math("MULTIPLY", rings, 0.2))
    b = _bsdf(t, **{"Roughness": 0.95, "Subsurface Weight": 0.1})
    t.nt.links.new(t.mix_color(1.0, lin(color), _gray(t, shade), blend="MULTIPLY"), b.inputs["Base Color"])
    t.nt.links.new(_bump(t, rings, 0.3, 0.0003), b.inputs["Normal"])
    t.link(b, "BSDF", out, "Surface")
    return mat


def gauze(name: str, color: str = "#d6d2c6", thread_m: float = 0.0009, open_weave: bool = False):
    """Loose cotton gauze: a woven grid of threads as a bump and a slight open-weave darkening, with sheen;
    open_weave lets light through the gaps between threads (a single layer, not a roll)."""
    mat, t, out = _new(name)
    uv = t.node("ShaderNodeUVMap", uv_map="UVMap")
    m = t.node("ShaderNodeMapping", vector_type="POINT")
    m.inputs["Scale"].default_value = (1.0 / thread_m, 1.0 / thread_m, 1.0)
    t.link(uv, "UV", m, "Vector")
    sep = t.node("ShaderNodeSeparateXYZ")
    t.link(m, "Vector", sep, "Vector")
    wx = t.math("ABSOLUTE", t.math("SINE", t.math("MULTIPLY", sep.outputs["X"], 3.14159)))
    wy = t.math("ABSOLUTE", t.math("SINE", t.math("MULTIPLY", sep.outputs["Y"], 3.14159)))
    thread = t.math("MAXIMUM", t.math("POWER", wx, 0.35), t.math("POWER", wy, 0.35))
    b = _bsdf(t, **{"Roughness": 0.9, "Sheen Weight": 0.4, "Sheen Roughness": 0.5, "Subsurface Weight": 0.15})
    b.inputs["Subsurface Radius"].default_value = (1.0, 1.0, 0.95)
    b.inputs["Subsurface Scale"].default_value = 0.002
    shade = t.math("ADD", 0.7, t.math("MULTIPLY", thread, 0.3))
    t.nt.links.new(t.mix_color(1.0, lin(color), _gray(t, shade), blend="MULTIPLY"), b.inputs["Base Color"])
    t.nt.links.new(_bump(t, thread, 0.5, 0.0005), b.inputs["Normal"])
    if open_weave:
        t.nt.links.new(t.map_range(thread, 0.55, 0.85, 0.3, 1.0), b.inputs["Alpha"])
    t.link(b, "BSDF", out, "Surface")
    return mat
