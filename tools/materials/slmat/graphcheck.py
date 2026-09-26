"""Validates tools/materials/graph.json against bands.json, targets.json and the asset lock before a build.

Pure Python (no numpy), so tests/materials.test.js runs it with plain python3. Every lookup the build and the Blender
library make by name (family, tier, source, tint presets, masks, exposed and dirt colours) must resolve here: a
missing name is a listed problem, never a silent default.
"""

from __future__ import annotations

import re

HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
TILING = {"rescale", "crop", "grid", "synth", "planks"}
PROVIDERS = {"Poly Haven", "ambientCG"}
# the binding uses a tint preset can be restricted to (params.tint.presetUse; tools/blender/materials/tints.py USES)
USES = ("floor", "wall", "furniture", "accent")


def _tint_problems(at: str, cfg: dict, layer: str) -> list:
    out = []
    presets = cfg.get("presets")
    if not isinstance(presets, dict) or not presets:
        return [f"{at}: {layer} has no presets"]
    for name, hx in presets.items():
        if not isinstance(hx, str) or not HEX.match(hx):
            out.append(f"{at}: {layer} preset '{name}' is not a #rrggbb colour ({hx!r})")
    if cfg.get("default") not in presets:
        out.append(f"{at}: default {layer} preset '{cfg.get('default')}' is not one of {sorted(presets)}")
    for name, uses in cfg.get("presetUse", {}).items():
        if name not in presets:
            out.append(f"{at}: presetUse names '{name}', not one of the {layer} presets {sorted(presets)}")
        if not isinstance(uses, list) or not uses or any(u not in USES for u in uses):
            out.append(f"{at}: presetUse '{name}' must be a non-empty list of {list(USES)} ({uses!r})")
    if cfg.get("presetUse", {}).get(cfg.get("default")) is not None:
        out.append(f"{at}: the default {layer} preset '{cfg.get('default')}' cannot be restricted by presetUse")
    return out


def validate(graph: dict, bands: dict, targets: dict, sources: dict) -> list:
    """Problems as '<material>: <what>' lines; empty when every name resolves."""
    out = []
    seen = set()
    for m in graph.get("materials", []):
        mid = m.get("id", "?")
        at = f"graph.json {mid}"
        if mid in seen:
            out.append(f"{at}: duplicate id")
        seen.add(mid)
        if m.get("family") not in bands.get("families", {}):
            out.append(f"{at}: family '{m.get('family')}' has no band in bands.json (known: {sorted(bands.get('families', {}))})")
        if m.get("tier") not in targets.get("tiers", {}):
            out.append(f"{at}: tier '{m.get('tier')}' is not in targets.json (known: {sorted(targets.get('tiers', {}))})")
        src = sources.get(m.get("source"))
        if src is None:
            out.append(f"{at}: source '{m.get('source')}' is not in the asset lock")
        elif src.get("provider") not in PROVIDERS:
            out.append(f"{at}: source provider '{src.get('provider')}' has no map patterns")
        elif not (m.get("sizeM") or src.get("physicalSizeM")):
            out.append(f"{at}: no physical size (sizeM in graph.json or physicalSizeM in the lock)")
        tiling = m.get("tiling", {})
        if tiling.get("mode") not in TILING:
            out.append(f"{at}: tiling mode '{tiling.get('mode')}' is not one of {sorted(TILING)}")
        if tiling.get("mode") == "repeat" or "repeats" in tiling:
            out.append(f"{at}: 'repeat' tiling packs copies of the scan into the tile; use rescale, crop, grid, synth or planks")
        if tiling.get("tileM", targets.get("tileM")) not in (1, 2):
            out.append(f"{at}: tiling.tileM must be 1 or 2 m (ART.md §3)")
        if tiling.get("mode") == "grid" and not (isinstance(tiling.get("cells"), int) and isinstance(tiling.get("keep"), int) and 4 <= tiling["keep"] <= tiling["cells"]):
            out.append(f"{at}: grid tiling needs whole cells and keep >= 4 (at least 4 pattern periods per side)")
        if tiling.get("mode") == "planks":
            lm = tiling.get("lengthM")
            if not (isinstance(tiling.get("plankM"), (int, float)) and isinstance(lm, list) and len(lm) == 2 and 0 < lm[0] < lm[1]):
                out.append(f"{at}: planks tiling needs plankM and lengthM [min, max]")
            elif tiling.get("tileM") != 2:
                out.append(f"{at}: planks tiling lays a 2 m tile (joints need room to stagger)")
        tint = m.get("tint", {})
        out += _tint_problems(at, tint, "tint")
        if "secondary" in tint:
            out += _tint_problems(at, tint["secondary"], "secondary tint")
        mask = tint.get("mask")
        if mask not in ("full", "alpha"):
            out.append(f"{at}: tint.mask '{mask}' is not 'full' or 'alpha'")
        if mask == "alpha" and not ({"grout", "paint"} & set(m.get("masks", {}))):
            out.append(f"{at}: tint.mask 'alpha' needs a grout or paint mask")
        if "bare" in m.get("masks", {}) and not HEX.match(str(m.get("albedo", {}).get("bare", {}).get("baseColor", ""))):
            out.append(f"{at}: a bare-metal mask needs albedo.bare.baseColor")
        exposed = m.get("wear", {}).get("edge", {}).get("exposed", {})
        if not HEX.match(str(exposed.get("baseColor", ""))):
            out.append(f"{at}: wear.edge.exposed.baseColor is missing or not #rrggbb")
        if not HEX.match(str(m.get("dirt", {}).get("color", ""))):
            out.append(f"{at}: dirt.color is missing or not #rrggbb")
        if "range" not in m.get("roughness", {}):
            out.append(f"{at}: roughness.range is missing")
    return out
