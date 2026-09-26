#!/usr/bin/env python3
"""Builds the scanned material library: tools/materials/graph.json -> assets/materials/<id>/*.ktx2 + library.json.

Usage (from the repo root; tools/materials/build.sh sets up the venv and the KTX tools first):
    tools/materials/.venv/bin/python tools/materials/build.py [--only id1,id2] [--keep-work]

Inputs: graph.json (material nodes), targets.json (resolution / texel density / encoding / thresholds),
bands.json (docs/ART.md §7.2 bands), the asset lock (assets/sources.lock.json and this package's fragment in
assets/lock/ until the integrator merges it) and the restored sources in assets/cache/ (node tools/fetch-assets.mjs
--verify).
Outputs: assets/materials/<id>/{baseColor,normal,orm}.ktx2 (+ detailNormal.ktx2 for materials with a detail map),
assets/materials/_shared/variation.ktx2,
assets/materials/library.json. Work files go to tools/materials/work/ (gitignored).
"""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from slmat import calibrate as cal  # noqa: E402
from slmat import imageio as io  # noqa: E402
from slmat import graphcheck, ktx, mips, noise, periodic, planks, quilt, seam, stats  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "materials")
WORK = os.path.join(HERE, "work")

PATTERNS = {
    "Poly Haven": {
        "albedo": ["*_diff_2k.*", "*_diffuse_2k.*"],
        "normal": ["*_nor_gl_2k.*"],
        "roughness": ["*_rough_2k.*"],
        "ao": ["*_ao_2k.*"],
        "height": ["*_disp_2k.*", "*_displacement_2k.*"],
        "metal": ["*_metal_2k.*"],
    },
    "ambientCG": {
        "albedo": ["*_Color.png", "*_Color.jpg"],
        "normal": ["*_NormalGL.png", "*_NormalGL.jpg"],
        "roughness": ["*_Roughness.png", "*_Roughness.jpg"],
        "ao": ["*_AmbientOcclusion.png", "*_AmbientOcclusion.jpg"],
        "height": ["*_Displacement.png", "*_Displacement.jpg"],
        "metal": ["*_Metalness.png", "*_Metalness.jpg"],
    },
}

CHANNEL_WEIGHTS = {"albedo": 1.0, "normal": 0.8, "roughness": 0.5, "ao": 0.3, "height": 0.7, "metal": 0.5}
MANIFEST_SCHEMA = "survival-logs/asset-manifest@1"  # src/contracts/assets.js
VARIATION_ID = "materials/variation"
VARIATION_SEED = 20260922


WP = "WP-P0-05c"


def rebuild_recipe(toolchain: dict) -> dict:
    """The rebuild contract (src/contracts/assets.js RebuildRecipe) tools/asset-lock.mjs re-bakes entries with.

    The merged ledger is the lock; this package's own fragment is an input only while it exists (the integrator
    merges it into assets/sources.lock.json and re-bakes, which drops it from the list).
    """
    fragment = f"assets/lock/{WP}.json"
    inputs = ["tools/materials/", "tools/fetch-assets.mjs", "assets/sources.lock.json"]
    if os.path.exists(os.path.join(ROOT, fragment)):
        inputs.append(fragment)
    return {
        "entry": "tools/materials/build.sh",
        "args": ["--only", "{name}"],
        "inputs": inputs,
        "shared": ["assets/cache", "tools/bin"],
        "persist": ["tools/materials/.venv"],
        "tools": {k: str(v) for k, v in toolchain.items()},
        "seeds": {"variation": VARIATION_SEED},
        "cost": 45,
        "timeoutSec": 900,
    }


def rel(p: str) -> str:
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def read_lock() -> dict:
    files = []
    merged = os.path.join(ROOT, "assets", "sources.lock.json")
    if os.path.exists(merged):
        files.append(merged)
    files += sorted(glob.glob(os.path.join(ROOT, "assets", "lock", "*.json")))
    sources: dict = {}
    for f in files:
        for s in load_json(f).get("sources", []):
            sources.setdefault(s["id"], s)
    return sources


def source_maps(src: dict) -> dict:
    d = os.path.join(ROOT, "assets", "cache", *src["id"].split("/"))
    if not os.path.isdir(d):
        raise SystemExit(f"{src['id']} is not in assets/cache: run node tools/fetch-assets.mjs --verify")
    found = {}
    for role, pats in PATTERNS[src["provider"]].items():
        for p in pats:
            hits = sorted(glob.glob(os.path.join(d, "**", p), recursive=True))
            if hits:
                found[role] = hits[0]
                break
    return found


# ------------------------------------------------------------------------------------------ stages


def load_stack(m: dict, src: dict) -> tuple[dict, dict]:
    """Loads the source maps at full resolution; flat (placeholder) maps count as missing."""
    paths = source_maps(src)
    maps: dict = {}
    notes = {}
    if "albedo" not in paths:
        raise SystemExit(f"{m['id']}: {src['id']} has no base color map in assets/cache")
    albedo = io.load(paths["albedo"])[..., :3]
    maps["albedo"] = io.srgb_to_linear(albedo)
    h, w = albedo.shape[:2]
    for role in ("normal", "roughness", "ao", "height", "metal"):
        if role not in paths:
            continue
        a = io.load(paths[role])
        if a.shape[:2] != (h, w):
            a = np.asarray(Image.fromarray(a[..., 0] if a.shape[2] == 1 else (a * 255).astype(np.uint8)).resize((w, h)))
            a = a.astype(np.float32)[..., None] / (1.0 if a.dtype == np.float32 else 255.0)
        if role == "normal":
            maps[role] = cal.unpack_normal(a)
        else:
            a = a[..., :1]
            if cal.is_flat(a):
                notes[role] = "source map is a flat placeholder; derived instead"
                continue
            maps[role] = a
    return maps, {"files": {k: rel(v) for k, v in paths.items()}, **({"ignored": notes} if notes else {})}


def pack(maps: dict) -> tuple[np.ndarray, list, np.ndarray]:
    order, arrays, weights = [], [], []
    for role in ("albedo", "normal", "roughness", "ao", "height", "metal"):
        if role in maps:
            a = maps[role]
            order.append((role, a.shape[2]))
            arrays.append(a)
            weights += [CHANNEL_WEIGHTS[role]] * a.shape[2]
    return np.concatenate(arrays, axis=2), order, np.array(weights, dtype=np.float32)


def unpack(stack: np.ndarray, order: list) -> dict:
    out, k = {}, 0
    for role, c in order:
        out[role] = stack[..., k : k + c]
        k += c
    out["albedo"] = np.clip(out["albedo"], 0.0, 1.0)
    if "normal" in out:
        out["normal"] = cal.normalize(out["normal"])
    for role in ("roughness", "ao", "height", "metal"):
        if role in out:
            out[role] = np.clip(out[role], 0.0, 1.0)
    return out


def tile(maps: dict, m: dict, src: dict, res: int, tile_m: float, max_change: float) -> tuple[dict, dict]:
    stack, order, weights = pack(maps)
    h, w = stack.shape[:2]
    size = m.get("sizeM") or src.get("physicalSizeM")
    if not size:
        raise SystemExit(f"{m['id']}: no physical size (set sizeM in graph.json)")
    sx, sy = float(size[0]), float(size[1])
    mode = m["tiling"]["mode"]
    info: dict = {"mode": mode, "sourceSizeM": [sx, sy], "sourcePx": [w, h]}
    if mode == "rescale":
        scale = [tile_m / sx, tile_m / sy]
        out = periodic.resample(stack, res, res)
        src_px = [w / res, h / res]
    elif mode == "synth":
        # a scan smaller than the tile: quilt a non-repeating tile from it at its native scale (slmat/quilt.py)
        density = res / tile_m
        spx, spy = max(8, round(sx * density)), max(8, round(sy * density))
        native = periodic.resample(stack, spy, spx)
        k = unpack(native, order)
        sigma = min(spx, spy) / m["tiling"].get("preFlattenDiv", 8.0)
        f = m.get("albedo", {}).get("flatten", {})
        k["albedo"] = cal.flatten(k["albedo"], sigma, f.get("strength", 0.8))
        if "equalize" in m["tiling"]:
            eq = m["tiling"]["equalize"]
            k["albedo"] = cal.equalize(k["albedo"], eq["sigmaM"] * density, eq["amount"])
        for role in ("roughness", "ao", "height"):
            if role in k:
                k[role] = np.clip(periodic.high_pass(k[role], sigma, 1.0), 0.0, 1.0)
        if "normal" in k:
            k["normal"][..., :2] = periodic.high_pass(k["normal"][..., :2], sigma, 1.0)
            k["normal"] = cal.normalize(k["normal"])
        native, order2, _ = pack(k)
        tl = m["tiling"]
        block = tl.get("blockPx") or max(b for b in (16, 32, 64, 128) if res % b == 0 and b * 1.25 <= 0.8 * min(spx, spy))
        overlap = int(round(block * tl.get("overlapFrac", 0.25)))
        out, qinfo = quilt.quilt(native, res, block, overlap, weights, m["id"], tl.get("candidates", 64), tl.get("jitter", 0.0), tl.get("feather", 2))
        order = order2
        scale = [sx * density / spx, sy * density / spy]
        info.update({"quilt": qinfo, "nativePx": [spx, spy], "preFlattenSigmaPx": round(sigma, 2)})
        src_px = [w / spx, h / spy]
    elif mode == "planks":
        # a plank scan: whole boards laid with staggered joints into a 2 m tile (slmat/planks.py)
        density = res / tile_m
        out, pinfo = planks.lay(stack, order, (sx, sy), res, tile_m, m["tiling"], m["id"])
        spx, spy = pinfo["nativePx"]
        scale = [sx * density / spx, sy * density / spy * pinfo["rowScale"]]
        info.update({"planks": pinfo})
        src_px = [w / spx, h / spy]
    elif mode == "grid":
        # a scan of a regular grid (tiles): keep whole cells, cut at the middle of a grout line so the wrap falls
        # inside grout; params.patternM declares the cell
        cells, keep = m["tiling"]["cells"], m["tiling"]["keep"]
        if res % keep:
            raise SystemExit(f"{m['id']}: {keep} cells do not divide {res} px")
        cell = res // keep
        big = periodic.resample(stack, cells * cell, cells * cell)
        k = unpack(big, order)
        prof = k["height"][..., 0] if "height" in k else io.luminance(k["albedo"])
        def grout_centre(p1: np.ndarray) -> int:
            # the middle of the lowest run in one cell (grout is a flat-bottomed trough)
            q = np.concatenate([p1[:cell], p1[:cell]])
            low = q <= q.min() + 0.25 * (q.max() - q.min())
            best, run = (0, 0), None
            for i, v in enumerate(low):
                run = (run if run is not None else i) if v else None
                if v and i - run + 1 > best[1]:
                    best = (run, i - run + 1)
            return int(best[0] + best[1] // 2) % cell

        x0 = grout_centre(prof.mean(axis=0))
        y0 = grout_centre(prof.mean(axis=1))
        out = periodic.crop(big, y0, x0, res, res)
        scale = [tile_m / (sx * keep / cells), tile_m / (sy * keep / cells)]
        info.update({"cells": cells, "keep": keep, "cellPx": cell, "cutPx": [x0, y0]})
        src_px = [w / (cells * cell), h / (cells * cell)]
    elif mode == "crop":
        n = int(round(tile_m / sx * w))
        ny_ = int(round(tile_m / sy * h))
        if abs(n - ny_) > 2:
            raise SystemExit(f"{m['id']}: crop needs square source pixels")
        ox, oy = m["tiling"].get("origin", [0.0, 0.0])
        x0, y0 = int(ox * w), int(oy * h)
        cropped, sinfo = seam.tileable_crop(stack, y0, x0, n, max(8, n // 6), weights)
        out = cropped if n == res else periodic.resample(cropped, res, res)
        scale = [1.0, 1.0]
        info.update({"cropPx": n, "originPx": [x0, y0], "seam": sinfo})
        src_px = [n / res, n / res]
    else:
        raise SystemExit(f"{m['id']}: unknown tiling mode {mode}")
    info["scale"] = [round(s, 4) for s in scale]
    info["sourcePxPerTexel"] = [round(s, 3) for s in src_px]
    if any(abs(s - 1.0) > max_change + 1e-6 for s in scale):
        raise SystemExit(f"{m['id']}: tiling changes the physical scale by {scale} (> {max_change:.0%}); use crop, grid or synth")
    if min(src_px) < 1.0 - 1e-6:
        raise SystemExit(f"{m['id']}: tiling would upsample the source ({src_px} source px per texel)")
    return unpack(out, order), info


def flatten_stage(t: dict, m: dict, tiling: dict, res: int, px_per_m: float) -> dict:
    """High-passes roughness, AO and normals so low frequencies cannot repeat visibly.

    On when albedo.flatten.all is set ('synth' tiling high-passes the scan before quilting instead). Base color is flattened in the albedo stage (log domain).
    """
    f = m.get("albedo", {}).get("flatten", {})
    if f.get("all"):
        sigma, strength = f["sigmaM"] * px_per_m, f["strength"]
    else:
        return t
    out = dict(t)
    for role in ("roughness", "ao"):
        if role in t:
            out[role] = np.clip(periodic.high_pass(t[role], sigma, strength), 0.0, 1.0)
    if "normal" in t:
        n = t["normal"].copy()
        n[..., :2] = periodic.high_pass(n[..., :2], sigma, strength)
        out["normal"] = cal.normalize(n)
    tiling["flattenAll"] = {"sigmaPx": round(sigma, 2), "strength": strength}
    return out


def heal_seams(maps: dict, cfg: dict) -> list:
    """Repairs wrap seams the source itself carries (checked on the finished level-0 maps)."""
    healed = []
    for axis, name in ((1, "x"), (0, "y")):
        chans = {
            "baseColor": cal.lum_srgb(maps["base"]),
            "normalX": maps["normal"][..., 0] * 127.5,
            "normalY": maps["normal"][..., 1] * 127.5,
            "roughness": maps["rough"][..., 0] * 255.0,
        }
        # heal with a margin below the check's limits: block compression can push a borderline seam over
        margin = {"maxZ": cfg["seam"]["maxZ"] * 0.75, "maxRatioToP99": 1 + (cfg["seam"]["maxRatioToP99"] - 1) * 0.5}
        bad = [k for k, v in chans.items() if not stats.seam_ok({name: stats.seam_metric(v)[name]}, margin)]
        if bad:
            # only the flagged maps: a step spread over a map whose seam is fine (roughness beside grout at the wrap)
            # pushes texels out of their range
            keys = (["base", "alpha"] if "baseColor" in bad else []) + (["rough", "ao", "metal"] if "roughness" in bad else [])
            for key in keys:
                if maps.get(key) is not None:
                    maps[key] = np.clip(periodic.heal_wrap(maps[key], axis), 0.0, 1.0)
            if "normalX" in bad or "normalY" in bad:
                maps["normal"] = cal.normalize(periodic.heal_wrap(maps["normal"], axis))
            healed.append({"axis": name, "channels": bad})
    return healed


def masks(t: dict, m: dict) -> dict:
    """Material-specific region masks (H, W) in 0..1."""
    out = {}
    spec = m.get("masks", {})
    if "grout" in spec:
        g = spec["grout"]
        hn = cal.remap(t["height"][..., 0], 0.0, 1.0, (1.0, 99.0))
        out["grout"] = 1.0 - noise.smoothstep(g["low"], g["high"], hn)
        out["face"] = 1.0 - out["grout"]
    if "paint" in spec:
        # Rust is where red clearly exceeds green (the paint here is green-hued, drips included); bright,
        # colorless texels count as bare metal when the source has any.
        lin = t["albedo"]
        y = io.luminance(lin)
        s = lin.sum(axis=2) + 1e-4
        q = (lin[..., 0] - lin[..., 1]) / s
        lo, hi = spec["paint"]["rustHue"]
        rust = periodic.gaussian_blur(noise.smoothstep(lo, hi, q), 0.8)
        if "harden" in spec["paint"]:
            # partly painted texels keep untinted paint in the base color and read as a pale halo once tinted
            rust = noise.smoothstep(*spec["paint"]["harden"], rust)
        chroma = np.linalg.norm(lin - y[..., None], axis=2) / np.maximum(y, 1e-4)
        b = spec.get("bare")
        if b:
            val = np.log(np.maximum(y, 1e-4) / float(np.median(y)))
            bare = noise.smoothstep(np.log(b["minValue"]) * 0.8, np.log(b["minValue"]) * 1.2, val) * (
                1.0 - noise.smoothstep(b["maxChroma"] * 0.7, b["maxChroma"] * 1.4, chroma)
            )
            bare = periodic.gaussian_blur(bare, 0.6)
        else:
            bare = np.zeros_like(y)
        rust = np.clip(rust * (1.0 - bare), 0.0, 1.0)
        paint = np.clip(1.0 - rust - bare, 0.0, 1.0)
        out.update({"paint": paint.astype(np.float32), "bare": bare.astype(np.float32), "rust": rust.astype(np.float32)})
    return out


def albedo_stage(t: dict, mk: dict, m: dict, band: dict, limits: dict, px_per_m: float) -> tuple[np.ndarray, dict]:
    a = m.get("albedo", {})
    chan_max = 0.98 if band.get("metal") == "full" else 0.93
    lin = t["albedo"]
    report: dict = {}
    if "constant" in a:
        c = io.hex_to_linear(a["constant"])
        smudge = cal.remap(io.luminance(lin), 0.0, 1.0, (1.0, 99.5))
        out = np.broadcast_to(c, lin.shape) * (1.0 - a.get("smudge", 0.0) * smudge)[..., None]
        out = out.astype(np.float32)
        return out, {"constant": a["constant"], "after": cal.band_stats(out)}
    if "flatten" in a:
        f = a["flatten"]
        lin = cal.flatten(lin, f["sigmaM"] * px_per_m, f["strength"])
    if "tame" in a:
        tm = a["tame"]
        lin = cal.tame(lin, tm["sigmaM"][0] * px_per_m, tm["sigmaM"][1] * px_per_m, tm["k"])
    base = cal.desaturate(lin, a.get("desaturate", 0.0), a.get("hue"))
    if "face" in mk:
        face, grout = mk["face"], mk["grout"]
        faces, r1 = cal.fit_band(base, band["albedo"], limits, a.get("target"), a.get("contrast", 1.0), weight=face)
        g = a["grout"]
        gl = cal.desaturate(lin, g.get("desaturate", 1.0))
        grouts, r2 = cal.fit_band(gl, [0.0, 1.0], limits, g["target"], 0.5, weight=grout)
        out = faces * face[..., None] + grouts * grout[..., None]
        if g.get("rimToFace"):
            # the scan's bevel catches light beside the grout; at a texel or two of grout that rim reads as a pale line
            gm = grout > 0.5
            near = gm.copy()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                near |= np.roll(np.roll(gm, dy, 0), dx, 1)
            rim = near & ~gm
            y = io.luminance(out)
            med = float(np.median(y[(face > 0.5) & ~near]))
            out = out * np.where(rim, np.minimum(1.0, med / np.maximum(y, 1e-6)), 1.0)[..., None]
        report = {"faces": r1, "grout": r2, "groutFraction": round(float(grout.mean()), 4)}
    elif "paint" in mk:
        paint, bare, rust = mk["paint"], mk["bare"], mk["rust"]
        painted, r1 = cal.fit_band(base, band["albedo"], limits, a.get("target"), a.get("contrast", 1.0), weight=paint)
        y = io.luminance(lin)
        steel = io.hex_to_linear(a["bare"]["baseColor"]) if (bare > 0).any() else np.zeros(3, np.float32)
        detail = (y / max(float(np.median(y[bare > 0.5])) if (bare > 0.5).any() else float(y.mean()), 1e-4)) ** 0.3
        bare_rgb = np.clip(steel[None, None, :] * detail[..., None], 0.0, 0.95)
        if "rust" in a:
            rmed = float(np.median(y[rust > 0.5])) if (rust > 0.5).any() else float(y.mean())
            rust_rgb = np.clip(io.hex_to_linear(a["rust"]["baseColor"])[None, None, :] * ((y / max(rmed, 1e-4)) ** 0.3)[..., None], 0.0, 0.93)
        else:
            rust_rgb = lin
        out = painted * paint[..., None] + bare_rgb * bare[..., None] + rust_rgb * rust[..., None]
        report = {
            "paint": r1,
            "fractions": {k: round(float(v.mean()), 4) for k, v in (("paint", paint), ("bare", bare), ("rust", rust))},
        }
    else:
        out, report = cal.fit_band(base, band["albedo"], limits, a.get("target"), a.get("contrast", 1.0), chan_max=chan_max)
    if "face" in mk or "paint" in mk:
        # one pass over the whole image keeps every region's tails inside the dielectric limits
        weight = mk.get("face", mk.get("paint"))
        out, r3 = cal.fit_band(out, band["albedo"], limits, cal.band_stats(out, weight)["median"], 1.0, weight=weight)
        report["final"] = r3["after"]
    if "ceiling" in a:
        # soft ceiling on isolated bright specks: luminance above ratio x median rolls off smoothly into it
        y = io.luminance(out)
        lim = a["ceiling"]["ratioToMedian"] * float(np.median(y))
        knee = 0.85 * lim
        yc = np.where(y > knee, knee + (lim - knee) * np.tanh((y - knee) / (lim - knee)), y)
        out = out * (yc / np.maximum(y, 1e-6))[..., None]
        report["ceiling"] = {"limit": round(lim, 4), "texelsAboveKnee": round(float((y > knee).mean()), 4)}
    return out.astype(np.float32), report


def roughness_stage(t: dict, mk: dict, m: dict, lin: np.ndarray, px_per_m: float) -> np.ndarray:
    r = m.get("roughness", {})
    lo, hi = r["range"]
    if r.get("from") == "smudge":
        s = cal.remap(io.luminance(t["albedo"]), 0.0, 1.0, (1.0, 99.5))
        return (lo + (hi - lo) * s[..., None]).astype(np.float32)
    if "derive" in r or "roughness" not in t:
        d = r.get("derive", {"base": 0.5, "albedo": -0.1, "cavity": 0.2})
        y = io.luminance(lin)
        yn = cal.remap(y, 0.0, 1.0, (1.0, 99.0))
        cav = cal.cavity(t["height"], 0.004 * px_per_m)[..., 0] if "height" in t else 0.0
        raw = d["base"] + d.get("albedo", 0.0) * (yn - 0.5) + d.get("cavity", 0.0) * cav
        src = raw[..., None].astype(np.float32)
    else:
        src = t["roughness"]
    if "face" in mk:
        faces = cal.remap(src, lo, hi)
        g_lo, g_hi = r["grout"]
        grout = cal.remap(src, g_lo, g_hi)
        return (faces * mk["face"][..., None] + grout * mk["grout"][..., None]).astype(np.float32)
    if "paint" in mk:
        paint = cal.remap(src, lo, hi)
        out = paint * mk["paint"][..., None] + r.get("bare", lo) * mk["bare"][..., None] + r["rust"] * mk["rust"][..., None]
        return out.astype(np.float32)
    return cal.remap(src, lo, hi, tuple(r.get("pct", (1.0, 99.0))))


def normal_stage(t: dict, m: dict, px_per_m: float) -> np.ndarray:
    n = m.get("normal", {})
    if "normal" in t:
        base = t["normal"]
    elif "height" in t:
        base = cal.normal_from_height(t["height"], n.get("heightM", 0.002), 1.0 / px_per_m)
    else:
        base = np.zeros(t["albedo"].shape, dtype=np.float32)
        base[..., 2] = 1.0
    return cal.normal_strength(base, n.get("strength", 1.0))


def ao_stage(t: dict, m: dict, px_per_m: float) -> np.ndarray:
    a = m.get("ao", {})
    shape = t["albedo"].shape[:2] + (1,)
    if "constant" in a:
        return np.full(shape, a["constant"], dtype=np.float32)
    if "derive" in a or "ao" not in t:
        d = a.get("derive", {"sigmaM": 0.004, "strength": 0.6})
        ao = cal.ao_from_height(t["height"], d["sigmaM"] * px_per_m, d["strength"]) if "height" in t else np.ones(shape, np.float32)
    else:
        ao = t["ao"]
    ao = 1.0 - a.get("strength", 1.0) * (1.0 - ao)
    floor = a.get("floor", 0.0)
    return (floor + (1.0 - floor) * ao).astype(np.float32)


def metal_stage(t: dict, mk: dict, m: dict) -> np.ndarray:
    v = m.get("metal", 0)
    shape = t["albedo"].shape[:2] + (1,)
    if v == "bare":
        return mk["bare"][..., None].astype(np.float32)
    return np.full(shape, float(v), dtype=np.float32)


# ------------------------------------------------------------------------------------------ encode


def write_levels(levels: list, prefix: str, channels: int) -> list:
    paths = []
    for i, lv in enumerate(levels):
        p = f"{prefix}_{i:02d}.png"
        io.save_png(p, lv[..., :channels])
        paths.append(p)
    return paths


def encode(levels: list, out_path: str, kind: str, targets: dict, has_alpha: bool = False) -> dict:
    enc = targets["encode"]
    if kind == "baseColor":
        fmt, tf, prim, args, ch = ("R8G8B8A8_SRGB" if has_alpha else "R8G8B8_SRGB"), "srgb", "bt709", enc["baseColor"], 4 if has_alpha else 3
    elif kind == "normal":
        fmt, tf, prim, args, ch = "R8G8B8_UNORM", "linear", "none", enc["normal"], 3
    elif kind == "orm":
        fmt, tf, prim, args, ch = "R8G8B8_UNORM", "linear", "none", enc["orm"], 3
    else:
        fmt, tf, prim, args, ch = "R8G8B8A8_UNORM", "linear", "none", enc["mask"], 4
    work = os.path.join(WORK, "levels", os.path.basename(os.path.dirname(out_path)), kind)
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work, exist_ok=True)
    files = write_levels(levels, os.path.join(work, "l"), ch)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    res = ktx.create(files, out_path, fmt, tf, args, prim)
    return {"format": fmt, "transfer": tf, "psnr": res["psnr0"]}


def decode(ktx_path: str) -> np.ndarray:
    tmp = os.path.join(WORK, "decoded", rel(ktx_path).replace("/", "__") + ".png")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    ktx.extract_level0(ktx_path, tmp)
    return np.asarray(Image.open(tmp).convert("RGBA"))


def map_entry(path: str, codec: str, color_space: str, size: int, channels: str, enc: dict) -> dict:
    return {
        "path": rel(path),
        "codec": codec,
        "colorSpace": color_space,
        "width": size,
        "height": size,
        "levels": mips.chain_length(size),
        "channels": channels,
        "bytes": os.path.getsize(path),
        "sha256": sha256(path),
        "psnr": None if enc["psnr"] is None else round(enc["psnr"], 2),
    }


def normal_mips(n: np.ndarray) -> list:
    """Mip chain of a unit normal map: 2x2 averages of the level-0 vectors, renormalized per level."""
    levels, avg = [], n.astype(np.float64)
    while True:
        unit = avg / np.maximum(np.linalg.norm(avg, axis=2, keepdims=True), 1e-6)
        levels.append((unit * 0.5 + 0.5).astype(np.float32))
        if avg.shape[0] == 1:
            return levels
        avg = periodic.box_down2(avg)


def build_detail(m: dict, maps: dict, src: dict, targets: dict, out_dir: str) -> tuple[str, dict, dict]:
    """A tileable close-up normal map cut from the source at its native scale (targets.detail: size and extent).

    The window is detail.sizeM metres of the source (rescaled to a whole number of source pixels), made tileable by
    the same min-cut seam repair as crops, resampled to targets.detail.resolution and renormalized.
    """
    d = m["detail"]
    res = targets["detail"]["resolution"]
    size_m = float(d.get("sizeM", targets["detail"]["sizeM"]))
    sx = float((m.get("sizeM") or src["physicalSizeM"])[0])
    h, w = maps["albedo"].shape[:2]
    n = int(round(size_m / sx * w))
    if n < res:
        raise SystemExit(f"{m['id']}: detail window {n} px is below {res} px (source too coarse for {size_m} m)")
    stack = np.concatenate([maps["normal"], maps.get("height", io.luminance(maps["albedo"])[..., None])], axis=2)
    ox, oy = d.get("origin", [0.37, 0.61])
    crop, _ = seam.tileable_crop(stack, int(oy * h), int(ox * w), n, max(8, n // 6), np.array([1, 1, 0.5, 0.7], np.float32))
    nrm = cal.normal_strength(cal.normalize(periodic.resample(crop, res, res)[..., :3]), d.get("strength", 1.0))
    path = os.path.join(out_dir, "detailNormal.ktx2")
    enc = encode(normal_mips(nrm), path, "normal", targets)
    dec = decode(path)
    st = {
        "normal": stats.normal_stats(dec),
        "seams": {"normalX": stats.seam_metric(dec[..., 0].astype(np.float32)), "normalY": stats.seam_metric(dec[..., 1].astype(np.float32))},
    }
    params = {"sizeM": size_m, "strength": d.get("strength", 1.0), "blend": "whiteout", "fadeM": d.get("fadeM", [1.0, 3.0])}
    return path, {"entry": map_entry(path, "uastc", "linear", res, "xyz", enc), "stats": st}, params


# ------------------------------------------------------------------------------------------ build


def build_material(m: dict, cfg: dict) -> dict:
    targets, bands, sources = cfg["targets"], cfg["bands"], cfg["sources"]
    tier = targets["tiers"][m["tier"]]
    density = tier["texelDensity"]
    tile_m = float(m["tiling"].get("tileM", targets["tileM"]))
    res = int(round(density * tile_m))
    if res & (res - 1):
        raise SystemExit(f"{m['id']}: {density} px/m over {tile_m} m is {res} px, not a power of two")
    px_per_m = density
    src = sources[m["source"]]
    fam = bands["families"][m["family"]]
    metal_family = fam.get("metal") == "full"
    limits = dict(bands["metal" if metal_family else "dielectric"])

    maps, load_info = load_stack(m, src)
    t, tiling = tile(maps, m, src, res, tile_m, targets["maxScaleChange"])
    t = flatten_stage(t, m, tiling, res, px_per_m)
    mk = masks(t, m)
    base_lin, albedo_report = albedo_stage(t, mk, m, fam, limits, px_per_m)
    rough = roughness_stage(t, mk, m, base_lin, px_per_m)
    normal = normal_stage(t, m, px_per_m)
    ao = ao_stage(t, m, px_per_m)
    metal = metal_stage(t, mk, m)
    tint = m.get("tint", {})
    alpha = None
    if tint.get("mask") == "alpha":
        alpha = (mk["face"] if "face" in mk else mk["paint"])[..., None].astype(np.float32)

    fin = {"base": base_lin, "normal": normal, "rough": rough, "ao": ao, "metal": metal, "alpha": alpha}
    healed = heal_seams(fin, targets["checks"])
    if healed:
        tiling["healed"] = healed
    base_lin, normal, rough, ao, metal, alpha = (fin[k] for k in ("base", "normal", "rough", "ao", "metal", "alpha"))

    out_dir = os.path.join(OUT, m["id"])
    os.makedirs(out_dir, exist_ok=True)
    paths = {k: os.path.join(out_dir, f"{k}.ktx2") for k in ("baseColor", "normal", "orm")}
    # block compression overshoots by a few codes: clamp inside the hard limits, tightening until every decoded
    # texel is within them (transmissive glass is judged by its tint instead)
    raw_base = base_lin.copy()
    local_fixes: list = []
    no_rdo = ["--no-endpoint-rdo", "--no-selector-rdo"]
    for attempt, (lo_k, hi_k, extra) in enumerate(((1.15, 0.97, []), (1.15, 0.97, no_rdo), (1.4, 0.94, no_rdo), (1.8, 0.9, no_rdo), (2.5, 0.85, no_rdo))):
        if not fam.get("transmissive"):
            y = io.luminance(raw_base)
            yc = np.clip(y, limits["min"] * lo_k, limits["max"] * hi_k)
            base_lin = raw_base * (yc / np.maximum(y, 1e-6))[..., None]
        levels = mips.build(base_lin, normal, rough, ao, metal, alpha)
        enc_targets = {**targets, "encode": {**targets["encode"], "baseColor": targets["encode"]["baseColor"] + extra}}
        enc_base = encode(levels["baseColor"], paths["baseColor"], "baseColor", enc_targets, alpha is not None)
        shown_y = io.luminance(io.srgb_to_linear(decode(paths["baseColor"])[..., :3].astype(np.float32) / 255.0))
        if fam.get("transmissive") or (shown_y.min() >= limits["min"] and shown_y.max() <= limits["max"]):
            break
        # a hard edge inside a 4x4 block can still overshoot: pull that block's extremes toward its median
        bad = (shown_y > limits["max"]) | (shown_y < limits["min"])
        for by, bx in sorted({(int(y) // 4, int(x) // 4) for y, x in zip(*np.nonzero(bad))}):
            blk = raw_base[by * 4 : by * 4 + 4, bx * 4 : bx * 4 + 4]
            yb = io.luminance(blk)
            med = float(np.median(yb))
            yt = np.clip(yb, med / 1.25, med * 1.25)
            raw_base[by * 4 : by * 4 + 4, bx * 4 : bx * 4 + 4] = blk * (yt / np.maximum(yb, 1e-6))[..., None]
            local_fixes.append([bx * 4, by * 4])
    else:
        raise SystemExit(f"{m['id']}: decoded base color {shown_y.min():.4f}-{shown_y.max():.4f} outside {limits['min']}-{limits['max']}")
    if attempt:
        tiling["preEncodeClamp"] = {"attempt": attempt, "range": [round(limits["min"] * lo_k, 4), round(limits["max"] * hi_k, 4)], "extraArgs": extra}
        if local_fixes:
            tiling["preEncodeClamp"]["blocksEvened"] = local_fixes
    enc = {
        "baseColor": enc_base,
        "normal": encode(levels["normal"], paths["normal"], "normal", targets),
        "orm": encode(levels["orm"], paths["orm"], "orm", targets),
    }

    dec = {k: decode(p) for k, p in paths.items()}
    sat = targets["checks"]["roughnessSaturation"]
    s = {
        "baseColor": stats.base_color_stats(dec["baseColor"]),
        "orm": stats.orm_stats(dec["orm"], sat),
        "normal": stats.normal_stats(dec["normal"]),
        "seams": stats.seams(dec["baseColor"], dec["normal"], dec["orm"]),
    }
    shown = io.luminance(io.srgb_to_linear(dec["baseColor"][..., :3].astype(np.float32) / 255.0))
    # graphcheck guarantees the default preset exists
    tl = io.hex_to_linear(tint["presets"][tint["default"]])
    wa = dec["baseColor"][..., 3].astype(np.float32) / 255.0 if alpha is not None else 1.0
    shown = io.luminance(io.srgb_to_linear(dec["baseColor"][..., :3].astype(np.float32) / 255.0) * (1.0 - np.asarray(wa)[..., None] * (1.0 - tl[None, None, :])))
    pattern_px = int(round(res / tiling["keep"])) if tiling["mode"] == "grid" else None
    s["repetition"] = stats.repetition(shown, targets["checks"]["repetition"])
    s["selfCopy"] = stats.self_copy(dec["baseColor"], targets["checks"]["selfCopy"]["fractions"], pattern_px)
    detail_path = detail_meta = detail_params = None
    if m.get("detail"):
        detail_path, detail_meta, detail_params = build_detail(m, maps, src, targets, out_dir)
        s["detailNormal"] = detail_meta["stats"]
    tinted = {}
    if tint.get("presets"):
        srgb = dec["baseColor"][..., :3].astype(np.float32) / 255.0
        lin = io.srgb_to_linear(srgb)
        w = dec["baseColor"][..., 3:4].astype(np.float32) / 255.0 if alpha is not None else np.ones_like(lin[..., :1])
        for name, hx in tint["presets"].items():
            tl = io.hex_to_linear(hx)
            tl_lin = lin * (1.0 - w + w * tl[None, None, :])
            st = cal.band_stats(tl_lin)
            tinted[name] = {"median": st["median"], "p005": st["p005"], "p995": st["p995"]}

    maps_meta = {
        "baseColor": map_entry(paths["baseColor"], "etc1s", "srgb", res, "rgba" if alpha is not None else "rgb", enc["baseColor"]),
        "normal": map_entry(paths["normal"], "uastc", "linear", res, "xyz", enc["normal"]),
        "orm": map_entry(paths["orm"], "etc1s", "linear", res, "ao,roughness,metallic", enc["orm"]),
    }
    if detail_path:
        maps_meta["detailNormal"] = detail_meta["entry"]
    params = {
        "name": m["name"],
        "family": m["family"],
        "tier": m["tier"],
        "rooms": m.get("rooms", []),
        "sizeM": [round(tile_m, 4), round(tile_m, 4)],
        "maps": {k: {"codec": v["codec"], "colorSpace": v["colorSpace"], "channels": v["channels"]} for k, v in maps_meta.items()},
        "pbr": {
            "baseColorFactor": [1, 1, 1, 1],
            "roughnessFactor": 1,
            # dielectrics multiply the (codec-noisy) metalness channel out entirely
            "metalnessFactor": 0 if fam.get("metal") == "none" else 1,
            "normalScale": 1,
            "aoIntensity": 1,
            "ior": m.get("pbr", {}).get("ior", 1.5),
            **{k: v for k, v in m.get("pbr", {}).items() if k != "ior"},
        },
        "tint": tint,
        "variation": {"texture": VARIATION_ID, "scaleM": cfg["targets"]["shared"]["variationSizeM"], **m.get("variation", {})},
        "wear": m.get("wear", {}),
        "dirt": m.get("dirt", {}),
        "instance": {"tint": True, "wear": [0, 1], "dirt": [0, 1], "seed": True},
    }
    if detail_params:
        params["detail"] = {**detail_params, "texture": "detailNormal"}
    if tiling["mode"] == "grid":
        params["patternM"] = round(tile_m / tiling["keep"], 6)
    for k in ("grain", "features"):
        if k in m:
            params[k] = m[k]
    return {
        "id": f"materials/{m['id']}",
        "kind": "material",
        "path": rel(out_dir) + "/",
        "license": src["license"],
        "sources": [src["id"]],
        "files": {k: v["path"] for k, v in maps_meta.items()},
        "variants": {name: {"params": {"tint": hx, **({"use": tint["presetUse"][name]} if name in tint.get("presetUse", {}) else {})}} for name, hx in tint.get("presets", {}).items()},
        "params": params,
        "meta": {
            "texelDensity": round(res / tile_m, 2),
            "sizeBytes": sum(v["bytes"] for v in maps_meta.values()),
            "maps": {k: {kk: vv for kk, vv in v.items() if kk not in ("codec", "colorSpace", "channels", "path")} for k, v in maps_meta.items()},
            "stats": {**s, **({"tinted": tinted} if tinted else {})},
            "calibration": albedo_report,
            "quality": {
                "minPsnr": {**targets["checks"]["minPsnr"], **m.get("quality", {}).get("minPsnr", {})},
                **({"note": m["quality"]["note"]} if "note" in m.get("quality", {}) else {}),
            },
            "source": {
                "id": src["id"],
                "title": src["title"],
                "provider": src["provider"],
                "page": src.get("page"),
                "authors": src.get("authors", []),
                "madeBy": src.get("creationMethod"),
                "physicalSizeM": m.get("sizeM") or src.get("physicalSizeM"),
                "sizeFrom": "estimated" if "sizeM" in m else "provider",
                **({"sizeNote": m["sizeNote"]} if "sizeNote" in m else {}),
                **({"note": m["sourceNote"]} if "sourceNote" in m else {}),
                "tiling": tiling,
                "load": load_info,
            },
            "preview": f"docs/art/materials/{m['id']}.png",
        },
        "rebuild": "materials",
        "digests": {v["path"]: v["sha256"] for v in maps_meta.values()},
    }


def build_variation(targets: dict) -> dict:
    size = targets["shared"]["variationResolution"]
    rng = np.random.default_rng(VARIATION_SEED)
    r = noise.equalize(noise.spectral(size, 3.0, 1, 12, rng))
    g = noise.equalize(noise.spectral(size, 2.4, 2, 32, rng))
    b = noise.equalize(noise.spectral(size, 2.0, 3, 48, rng) + 0.6 * noise.spectral(size, 3.0, 1, 6, rng))
    a = noise.equalize(noise.spectral(size, 1.4, 8, 160, rng))
    img = np.stack([r, g, b, a], axis=2).astype(np.float32)
    levels = [img]
    while levels[-1].shape[0] > 1:
        levels.append(periodic.box_down2(levels[-1]))
    out = os.path.join(OUT, "_shared", "variation.ktx2")
    enc = encode(levels, out, "mask", targets)
    return {
        "id": VARIATION_ID,
        "kind": "texture",
        "path": rel(out),
        "license": "LicenseRef-Original",
        "params": {
            "role": "shared macro-variation mask for every material (periodic spectral noise generated by build.py, no inputs)",
            "codec": "uastc",
            "colorSpace": "linear",
            "sizeM": targets["shared"]["variationSizeM"],
            "channels": {
                "r": "macro value variation (uniform 0..1, 0.5 = neutral)",
                "g": "macro roughness variation (uniform 0..1, 0.5 = neutral)",
                "b": "grime blotches (uniform 0..1; threshold 1 - amount)",
                "a": "wear breakup (uniform 0..1)",
            },
        },
        "meta": {
            "width": size,
            "height": size,
            "levels": len(levels),
            "sizeBytes": os.path.getsize(out),
            "sha256": sha256(out),
            "psnr": None if enc["psnr"] is None else round(enc["psnr"], 2),
        },
        "rebuild": {"recipe": "materials", "args": ["--only", "_shared"]},
        "digests": {rel(out): sha256(out)},
    }


def check(entry: dict, cfg: dict) -> list:
    """Fast build-time checks (docs/ART.md §3, §7.2); tests/materials.test.js re-runs them on the shipped files."""
    errs = []
    p, meta = entry["params"], entry["meta"]
    fam = cfg["bands"]["families"][p["family"]]
    metal_family = fam.get("metal") == "full"
    lim = cfg["bands"]["metal" if metal_family else "dielectric"]
    b = meta["stats"]["baseColor"]
    lo, hi = fam["albedo"]
    if not fam.get("transmissive"):
        if not lo <= b["albedoMedian"] <= hi:
            errs.append(f"albedo median {b['albedoMedian']} outside {fam['albedo']} ({fam['source']})")
        if b["albedoP005"] < lim["min"] or b["albedoP995"] > lim["max"]:
            errs.append(f"albedo p0.5-p99.5 {b['albedoP005']}-{b['albedoP995']} outside the hard limits {lim['min']}-{lim['max']}")
        for name, st in meta["stats"].get("tinted", {}).items():
            if st["p005"] < lim["min"] or st["p995"] > lim["max"]:
                errs.append(f"tint {name}: p0.5-p99.5 {st['p005']}-{st['p995']} outside {lim['min']}-{lim['max']}")
            floor_ok = "floor" in p["tint"].get("presetUse", {}).get(name, ["floor"])
            if p["family"] in cfg["targets"]["checks"]["presetUse"]["floorFamilies"] and floor_ok and not lo <= st["median"] <= hi:
                errs.append(f"tint {name}: median {st['median']} outside the floor band {fam['albedo']}; restrict it with presetUse")
    o = meta["stats"]["orm"]
    c = cfg["targets"]["checks"]
    if o["roughnessSaturated"] > c["roughnessSaturation"]["maxFraction"]:
        errs.append(f"roughness saturated on {o['roughnessSaturated']:.2%} of texels")
    rlo, rhi = fam["roughness"]
    if not rlo <= o["roughnessMedian"] <= rhi:
        errs.append(f"roughness median {o['roughnessMedian']} outside {fam['roughness']}")
    for key in ("normal", "detailNormal"):
        n = meta["stats"].get(key if key != "normal" else "normal")
        if key == "detailNormal":
            n = meta["stats"].get("detailNormal", {}).get("normal")
        if n and (n["lengthErrMean"] > c["normals"]["meanLengthError"] or n["lengthErrP99"] > c["normals"]["p99LengthError"] or n["minZ"] < c["normals"]["minZ"]):
            errs.append(f"{key} not unit length / flipped: {n}")
    seams = dict(meta["stats"]["seams"])
    seams.update({f"detail.{k}": v for k, v in meta["stats"].get("detailNormal", {}).get("seams", {}).items()})
    for ch, sm in seams.items():
        if not stats.seam_ok(sm, c["seam"]):
            errs.append(f"seam in {ch}: {sm}")
    sc = meta["stats"]["selfCopy"]
    if sc["minDiffCodes"] <= c["selfCopy"]["minMeanCodes"] or sc["ratio"] <= c["selfCopy"]["maxRatio"]:
        errs.append(f"the base color nearly equals itself shifted by {sc['at']} of the tile ({sc['minDiffCodes']} codes, {sc['ratio']} of an unrelated shift)")
    for blocks, limit in c["repetition"]:
        got = meta["stats"]["repetition"][str(blocks)]
        if got > limit:
            errs.append(f"repetition: a {blocks}x{blocks} block is {got:.0%} from the tile mean (limit {limit:.0%})")
    if abs(meta["texelDensity"] / cfg["targets"]["tiers"][p["tier"]]["texelDensity"] - 1) > cfg["targets"]["texelDensityTolerance"]:
        errs.append(f"texel density {meta['texelDensity']} px/m off its {p['tier']} class")
    for k, floor in meta["quality"]["minPsnr"].items():
        got = meta["maps"][k]["psnr"]
        if got is not None and got < floor:
            errs.append(f"{k} PSNR {got} dB below {floor} dB")
    return errs


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated material ids (others are kept from the existing library.json)")
    ap.add_argument("--keep-work", action="store_true", help="keep tools/materials/work/")
    args = ap.parse_args()

    graph = load_json(os.path.join(HERE, "graph.json"))
    cfg = {
        "targets": load_json(os.path.join(HERE, "targets.json")),
        "bands": load_json(os.path.join(HERE, "bands.json")),
        "sources": read_lock(),
    }
    problems = graphcheck.validate(graph, cfg["bands"], cfg["targets"], cfg["sources"])
    if problems:
        raise SystemExit("graph.json does not resolve:\n  " + "\n  ".join(problems))
    only = set(args.only.split(",")) if args.only else None
    lib_path = os.path.join(OUT, "library.json")
    previous = {}
    if only and os.path.exists(lib_path):
        previous = {e["id"]: e for e in load_json(lib_path).get("assets", [])}

    os.makedirs(WORK, exist_ok=True)
    entries, failures = [], {}
    for m in graph["materials"]:
        aid = f"materials/{m['id']}"
        if only and m["id"] not in only:
            if aid in previous:
                entries.append(previous[aid])
            continue
        print(f"[{m['id']}] building ({m['tier']}, {m['source']})", flush=True)
        e = build_material(m, cfg)
        errs = check(e, cfg)
        meta = e["meta"]
        b, o, mp = meta["stats"]["baseColor"], meta["stats"]["orm"], meta["maps"]
        print(
            f"[{m['id']}] albedo {b['albedoMedian']:.3f} ({b['albedoP005']:.3f}..{b['albedoP995']:.3f}) rough {o['roughnessMedian']:.2f}"
            f" metal {o['metallicMean']:.2f} rep {meta['stats']['repetition']} psnr {mp['baseColor']['psnr']}/{mp['normal']['psnr']}/{mp['orm']['psnr']}"
            f" scale {meta['source']['tiling']['scale']}" + ("" if not errs else "\n  FAIL " + "\n  FAIL ".join(errs)),
            flush=True,
        )
        if errs:
            failures[m["id"]] = errs
        entries.append(e)

    rebuild_shared = not only or "_shared" in only or VARIATION_ID not in previous
    shared = build_variation(cfg["targets"]) if rebuild_shared else previous[VARIATION_ID]
    t = cfg["targets"]
    toolchain = {"ktx": ktx.version(), "numpy": np.__version__, "pillow": Image.__version__}
    library = {
        "schema": MANIFEST_SCHEMA,
        "wp": WP,
        "library": {
            "schema": "survival-logs/material-library@1",
            "generator": "tools/materials/build.py (graph: tools/materials/graph.json)",
            "toolchain": toolchain,
            "units": "meters",
            "conventions": {
            "paths": "relative to the repository root",
            "uv": "meshes carry meter UVs (uv_m, 1 unit = 1 m, or world-planar position); texture uv = uv_m / sizeM",
            "baseColor": "sRGB; when channels is 'rgba' the alpha is the tint mask",
            "normal": "tangent space, OpenGL convention (+Y up), unit length, RGB = XYZ * 0.5 + 0.5",
            "orm": "linear; R = ambient occlusion, G = perceptual roughness, B = metalness (glTF packing)",
            "metalnessFactor": "scales the texture's metalness only (0 for dielectrics removes codec noise); wear layers set metalness directly",
            "tint": "baseColor.rgb *= mix(secondaryTint, tint, mask) in linear light; mask = 1 for 'full', baseColor alpha for 'alpha'",
            "variation": "shared periodic RGBA mask sampled at uv_m / variation.scaleM + offset, offset = "
            "(frac(seed * 0.6180339887498949), frac(seed * 0.4142135623730951)), i.e. mod 1, computed in float64 on the CPU "
            "(Python, JS numbers) for any integer seed 0..2^32-1 and passed to the shader already wrapped to [0, 1); the mask "
            "repeats every 1 in uv, so the shader adds it before sampling with REPEAT wrapping and never multiplies the raw seed "
            "in float32 (which loses precision above 2^24 and, in Cycles, broke texture lookups above about 2^20). "
            "baseColor *= 1 + value * (2r - 1); hue += hue * (2r - 1) turns; roughness += roughness * (2g - 1); "
            "b = grime, a = wear breakup",
            "detail": "materials with params.detail carry files.detailNormal: a tangent-space close-up normal map tiling every "
            "detail.sizeM metres (uv_m / detail.sizeM), whiteout-blended onto the base normal (n = normalize(nb.xy + nd.xy * "
            "strength, nb.z * nd.z)) and faded out linearly between detail.fadeM[0] and fadeM[1] metres of camera distance",
            "wear": "curvature c in 0..1 (convex edges; Blender uses bevel-normal difference, runtime a baked curvature map) "
            "times mix(1, 2a, edge.breakup); edge mask = smoothstep(t - width/2, t + width/2, c) with t = 1 - edge.amount * "
            "instance.wear; the mask blends to edge.exposed. cavity = max(1 - ao, geometric occlusion); baseColor *= "
            "1 - cavity.darken * cavity; roughness += cavity.roughness * cavity",
            "dirt": "mask = clamp(max(gravity.up * smoothstep(0.35, 1, world normal z), band * (1 - gravity.falloff / 2), "
            "dirt.cavity * cavity) * mix(1, 2b, dirt.grime) * 2 * instance.dirt); band = 1 - smoothstep(0, gravity.bottomM, "
            "height above the object's origin, which sits on the floor); baseColor/roughness blend to dirt.color/roughness, metalness to 0",
            "instance": "per-instance {tint: preset name or hex, secondaryTint, wear: 0..1, dirt: 0..1 (default dirt.amount), seed: integer}; "
            "tint.jitter gives the per-instance random hue/saturation/value spread; tint presets are also the entry's variants",
            },
            "targets": {
                "resolution": "texelDensity x the material's sizeM (256 px over 1 m, 512 px over 2 m at 256 px/m)",
                "texelDensity": {k: v["texelDensity"] for k, v in t["tiers"].items()},
                "texelDensityTolerance": t["texelDensityTolerance"],
                "tileM": t["tileM"],
                "note": "docs/ART.md §3 texel density classes (tiles repeat at tileM metres) and §7.2 bands (tools/materials/bands.json)",
            },
        },
        "rebuild": {"materials": rebuild_recipe(toolchain)},
        "assets": [shared, *entries],
    }
    with open(lib_path, "w", encoding="utf-8") as f:
        json.dump(library, f, indent=2)
        f.write("\n")
    print(f"wrote {rel(lib_path)} ({len(entries)} materials)")
    if not args.keep_work:
        shutil.rmtree(os.path.join(WORK, "levels"), ignore_errors=True)
    if failures:
        print(f"{len(failures)} material(s) failed checks: {', '.join(failures)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
