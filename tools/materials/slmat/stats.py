"""Objective checks on decoded textures (mirrors tools/materials/checks.mjs, which the tests run)."""

from __future__ import annotations

import numpy as np

from .imageio import linear_to_srgb, luminance, srgb_to_linear


def seam_metric(img: np.ndarray) -> dict:
    """Wrap-seam discontinuity vs interior adjacent-pixel steps, for columns and rows.

    img: (H, W) float. Returns z-scores and ratios to the 99th percentile of interior steps.
    """
    out = {}
    for axis, name in ((1, "x"), (0, "y")):
        d = np.abs(np.roll(img, -1, axis=axis) - img)
        e = d.mean(axis=1 - axis)
        seam, interior = float(e[-1]), e[:-1]
        mu, sd = float(interior.mean()), float(interior.std()) + 1e-9
        out[name] = {"z": (seam - mu) / sd, "ratio": seam / (float(np.percentile(interior, 99)) + 1e-9)}
    return out


def seam_ok(m: dict, cfg: dict) -> bool:
    return all(v["z"] <= cfg["maxZ"] or v["ratio"] <= cfg["maxRatioToP99"] for v in m.values())


def base_color_stats(rgba8: np.ndarray) -> dict:
    """Linear luminance (docs/ART.md §7.2 units): median and 0.5 / 99.5 percentiles, plus the sRGB-encoded mean."""
    y = luminance(srgb_to_linear(rgba8[..., :3].astype(np.float32) / 255.0))
    p = np.percentile(y, [0.5, 50, 99.5])
    return {
        "albedoMedian": round(float(p[1]), 4),
        "albedoP005": round(float(p[0]), 4),
        "albedoP995": round(float(p[2]), 4),
        "srgbMean": round(float((linear_to_srgb(y) * 255.0).mean()), 1),
        "channelMin": int(rgba8[..., :3].min()),
        "channelMax": int(rgba8[..., :3].max()),
    }


def repetition(lum: np.ndarray, levels: list) -> dict:
    """Largest block-mean deviation from the tile mean at each block count (tools/art-metrics.mjs tile-repetition)."""
    h, w = lum.shape
    mean = float(lum.mean()) or 1e-9
    out = {}
    for blocks, _ in levels:
        m = lum.reshape(blocks, h // blocks, blocks, w // blocks).mean(axis=(1, 3))
        out[str(blocks)] = round(float(np.abs(m - mean).max() / mean), 4)
    return out


def orm_stats(rgba8: np.ndarray, sat: dict) -> dict:
    r = rgba8[..., 1].astype(np.float32)
    return {
        "aoMean": round(float(rgba8[..., 0].mean() / 255.0), 4),
        "roughnessMean": round(float(r.mean() / 255.0), 4),
        "roughnessMedian": round(float(np.median(r) / 255.0), 4),
        "roughnessStd": round(float(r.std() / 255.0), 4),
        "roughnessP01": round(float(np.percentile(r, 1) / 255.0), 4),
        "roughnessP99": round(float(np.percentile(r, 99) / 255.0), 4),
        "roughnessSaturated": round(float(((r <= sat["low"]) | (r >= sat["high"])).mean()), 5),
        "metallicMean": round(float(rgba8[..., 2].mean() / 255.0), 4),
    }


def normal_stats(rgba8: np.ndarray) -> dict:
    n = rgba8[..., :3].astype(np.float32) / 127.5 - 1.0
    err = np.abs(np.linalg.norm(n, axis=2) - 1.0)
    return {
        "lengthErrMean": round(float(err.mean()), 4),
        "lengthErrP99": round(float(np.percentile(err, 99)), 4),
        "minZ": round(float(n[..., 2].min()), 4),
    }


def seams(base8: np.ndarray, normal8: np.ndarray, orm8: np.ndarray) -> dict:
    lum = luminance(srgb_to_linear(base8[..., :3].astype(np.float32) / 255.0))
    chans = {
        "baseColor": lum,
        "normalX": normal8[..., 0].astype(np.float32),
        "normalY": normal8[..., 1].astype(np.float32),
        "roughness": orm8[..., 1].astype(np.float32),
    }
    return {k: seam_metric(v) for k, v in chans.items()}


def self_copy(rgba8: np.ndarray, fractions: list, pattern_px: int | None = None) -> dict:
    """Is the base color a copy of itself shifted by a fraction of the tile along x or y?

    minDiffCodes: the smallest mean RGB difference (sRGB codes) over those shifts (tools/art-metrics.mjs selfCopy,
    over more fractions); ratio: that difference over the difference at an unrelated shift (0.37, 0.61 of the tile),
    so a copy reads near 0 however flat the texture is. Shifts that are whole pattern periods are skipped.
    """
    rgb = rgba8[..., :3].astype(np.float32)
    h, w = rgb.shape[:2]
    ref = float(np.abs(rgb - np.roll(np.roll(rgb, -int(0.37 * w), axis=1), -int(0.61 * h), axis=0)).mean()) + 1e-6
    best = (np.inf, None)
    for f in fractions:
        for axis, n in ((1, w), (0, h)):
            d = int(round(n * f))
            if d < 1 or (pattern_px and d % pattern_px == 0):
                continue
            diff = float(np.abs(rgb - np.roll(rgb, -d, axis=axis)).mean())
            if diff < best[0]:
                best = (diff, f"{'x' if axis == 1 else 'y'} 1/{round(1 / f)}")
    return {"minDiffCodes": round(best[0], 2), "ratio": round(best[0] / ref, 3), "at": best[1]}
