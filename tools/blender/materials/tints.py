"""Tint resolution for library materials, without bpy (tests/materials.test.js runs it with plain python3).

A tint is a preset name of the material, an explicit '#rrggbb' hex (sRGB) or an RGB tuple (linear). An unknown
preset name raises: a silent fallback would bake a wrong colour (a removed preset used to come out white).
"""

from __future__ import annotations


class UnknownTint(ValueError):
    """A preset name the material does not define."""


USES = ("floor", "wall", "furniture", "accent")


class PresetUse(ValueError):
    """A tint preset bound to a use its material restricts it from (params.tint.presetUse)."""


def check_use(e: dict, tint, use: str) -> None:
    """Raises when tint (a preset name) may not be bound to use. params.tint.presetUse maps a preset to the uses it is
    allowed for; a preset without an entry, a hex or an RGB tuple is allowed everywhere."""
    if use not in USES:
        raise ValueError(f"{e['id']}: unknown use '{use}'; one of {list(USES)}")
    cfg = _config(e, False)
    name = cfg.get("default") if tint is None else tint
    allowed = cfg.get("presetUse", {}).get(name) if isinstance(name, str) else None
    if allowed is not None and use not in allowed:
        raise PresetUse(f"{e['id']}: tint preset '{name}' is for {allowed}, not {use}")


def srgb_hex_to_linear(h: str) -> tuple[float, float, float]:
    s = h.lstrip("#")
    if len(s) != 6 or any(c not in "0123456789abcdefABCDEF" for c in s):
        raise ValueError(f"'{h}' is not a #rrggbb colour")
    out = []
    for i in (0, 2, 4):
        c = int(s[i : i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def _config(e: dict, secondary: bool) -> dict:
    cfg = e["params"].get("tint", {})
    return cfg.get("secondary", {}) if secondary else cfg


def resolve_tint(e: dict, tint=None, secondary: bool = False) -> tuple[float, float, float]:
    """Linear RGB for a tint of material entry e (a library.json asset entry).

    None means the material's default preset; a material without that tint layer (no secondary tint) is neutral.
    """
    cfg = _config(e, secondary)
    presets = cfg.get("presets", {})
    layer = "secondary tint" if secondary else "tint"
    if tint is None:
        if not cfg:
            return (1.0, 1.0, 1.0)
        tint = cfg.get("default")
        if tint not in presets:
            raise UnknownTint(f"{e['id']}: default {layer} preset '{tint}' is not one of {sorted(presets)}")
    if isinstance(tint, str):
        if tint.startswith("#"):
            return srgb_hex_to_linear(tint)
        if tint not in presets:
            raise UnknownTint(f"{e['id']}: unknown {layer} preset '{tint}'; available: {sorted(presets) or 'none'}")
        return srgb_hex_to_linear(presets[tint])
    rgb = tuple(float(v) for v in tint)
    if len(rgb) != 3:
        raise ValueError(f"{e['id']}: a {layer} tuple needs 3 linear RGB values, got {tint!r}")
    return rgb
