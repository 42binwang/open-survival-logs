"""Calibration: de-lighting (low-frequency flattening), neutralizing, value-band fitting, roughness and normal
conditioning, derived maps."""

from __future__ import annotations

import numpy as np

from .imageio import linear_to_srgb, luminance, srgb_to_linear
from .noise import smoothstep
from .periodic import gaussian_blur


def lum_srgb(lin_rgb: np.ndarray) -> np.ndarray:
    """Per-pixel luminance encoded to sRGB 0-255 (the unit of the value bands)."""
    return linear_to_srgb(luminance(lin_rgb)) * 255.0


def band_stats(lin_rgb: np.ndarray, weight: np.ndarray | None = None) -> dict:
    """Linear-luminance statistics in the units of docs/ART.md §7.2 (median, 0.5/99.5 percentiles), plus sRGB mean."""
    y = luminance(lin_rgb)
    vals = y[weight > 0.5] if weight is not None and (weight > 0.5).any() else y.ravel()
    p = np.percentile(vals, [0.5, 50, 99.5])
    return {
        "median": round(float(p[1]), 4),
        "p005": round(float(p[0]), 4),
        "p995": round(float(p[2]), 4),
        "srgbMean": round(float((linear_to_srgb(vals) * 255.0).mean()), 1),
    }


def flatten(lin_rgb: np.ndarray, sigma_px: float, strength: float) -> np.ndarray:
    """Removes low-frequency value/color drift (scan lighting, vignetting, blotches) in log space."""
    if strength <= 0:
        return lin_rgb
    eps = 1e-4
    log = np.log(lin_rgb + eps)
    low = gaussian_blur(log, sigma_px)
    mean = log.reshape(-1, log.shape[2]).mean(axis=0)
    return (np.exp(log - strength * (low - mean)) - eps).clip(0.0, 1.0).astype(np.float32)


def desaturate(lin_rgb: np.ndarray, amount: float, hue_hex: str | None = None) -> np.ndarray:
    """Pulls chroma toward neutral (or toward hue_hex) while keeping luminance."""
    if amount <= 0:
        return lin_rgb
    y = luminance(lin_rgb)[..., None]
    target = np.repeat(y, 3, axis=2)
    if hue_hex:
        from .imageio import hex_to_linear

        h = hex_to_linear(hue_hex)
        target = y * (h / float(h @ np.array([0.2126, 0.7152, 0.0722])))
    return (lin_rgb * (1 - amount) + target * amount).astype(np.float32)


def _soft_limit(y: np.ndarray, lo: float, hi: float, knee: float = 0.35) -> np.ndarray:
    """Compresses values above hi / below lo (linear) into the band with smooth knees."""
    out = y.copy()
    k_hi = hi - knee * (hi - lo) * 0.25
    over = y > k_hi
    span = hi - k_hi
    out[over] = k_hi + span * np.tanh((y[over] - k_hi) / span)
    llo, lk = np.log(lo), np.log(lo * 1.6)
    under = y < lo * 1.6
    ly = np.log(np.maximum(y[under], 1e-6))
    out[under] = np.exp(lk - (lk - llo) * np.tanh((lk - ly) / (lk - llo)))
    return out


def fit_band(
    lin_rgb: np.ndarray,
    band: list | tuple,
    limits: dict,
    target: float | None = None,
    contrast: float = 1.0,
    weight: np.ndarray | None = None,
    chan_max: float = 0.93,
) -> tuple[np.ndarray, dict]:
    """Scales the base color so its median linear luminance lands in the family band, then soft-limits the tails.

    band: [lo, hi] median linear luminance (docs/ART.md §7.2); limits: {"min", "max"} linear hard limits for the
    0.5 / 99.5 percentiles. target: explicit median; by default a median already inside the band is kept, otherwise
    it moves 15 % of the band width inside the nearest edge. contrast: > 1 expands, < 1 compresses the luminance
    spread around the median (log domain). weight: (H, W) mask of the texels that define the median (tile faces).
    """
    before = band_stats(lin_rgb, weight)
    y = luminance(lin_rgb)
    lo_b, hi_b = band
    sel = y[weight > 0.5] if weight is not None and (weight > 0.5).any() else y.ravel()
    med = float(np.median(sel))
    if target is None:
        pad = 0.15 * (hi_b - lo_b)
        target = med if lo_b <= med <= hi_b else (lo_b + pad if med < lo_b else hi_b - pad)
    rgb = lin_rgb
    if contrast != 1.0:
        ly = np.log(np.maximum(y, 1e-5))
        lm = np.log(max(med, 1e-5))
        y2 = np.exp(lm + (ly - lm) * contrast)
        rgb = rgb * (y2 / np.maximum(y, 1e-6))[..., None]
        y = y2
    g = float(target) / max(float(np.median(y[weight > 0.5] if weight is not None and (weight > 0.5).any() else y)), 1e-6)
    ys = y * g
    yl = _soft_limit(ys, limits["min"] * 1.06, limits["max"] * 0.97)
    out = rgb * (g * yl / np.maximum(ys, 1e-6))[..., None]
    out = np.clip(out, 0.0, chan_max).astype(np.float32)
    return out, {"gain": round(g, 4), "target": round(float(target), 4), "before": before, "after": band_stats(out, weight)}


def remap(x: np.ndarray, lo: float, hi: float, pct: tuple[float, float] = (1.0, 99.0), gamma: float = 1.0) -> np.ndarray:
    """Robustly normalizes x (percentiles -> 0..1) and maps it onto [lo, hi]."""
    a, b = np.percentile(x, pct)
    t = np.clip((x - a) / max(b - a, 1e-6), 0.0, 1.0) ** gamma
    return (lo + (hi - lo) * t).astype(np.float32)


def is_flat(x: np.ndarray, tol: float = 1.0 / 255.0) -> bool:
    return float(x.max() - x.min()) <= tol


def unpack_normal(rgb: np.ndarray, dx: bool = False) -> np.ndarray:
    n = rgb[..., :3] * 2.0 - 1.0
    if dx:
        n[..., 1] *= -1.0
    return normalize(n)


def normalize(n: np.ndarray) -> np.ndarray:
    n = n.copy()
    n[..., 2] = np.maximum(n[..., 2], 1e-3)
    return (n / np.linalg.norm(n, axis=2, keepdims=True)).astype(np.float32)


def normal_strength(n: np.ndarray, s: float) -> np.ndarray:
    if s == 1.0:
        return n
    m = n.copy()
    m[..., :2] *= s
    return normalize(m)


def normal_from_height(h: np.ndarray, height_m: float, pixel_m: float) -> np.ndarray:
    """OpenGL-convention normals (+Y up in texture space) from a periodic height map (0..1 * height_m)."""
    hh = h[..., 0] * height_m
    dx = (np.roll(hh, -1, axis=1) - np.roll(hh, 1, axis=1)) / (2 * pixel_m)
    dy_rows = (np.roll(hh, -1, axis=0) - np.roll(hh, 1, axis=0)) / (2 * pixel_m)
    n = np.stack([-dx, dy_rows, np.ones_like(hh)], axis=2)
    return normalize(n)


def cavity(h: np.ndarray, sigma_px: float) -> np.ndarray:
    """0..1, high where the surface sits below its neighborhood (grooves, pores, grout)."""
    d = gaussian_blur(h[..., 0], sigma_px) - h[..., 0]
    s = np.percentile(np.abs(d), 99) + 1e-6
    return np.clip(d / s, 0.0, 1.0)[..., None].astype(np.float32)


def ao_from_height(h: np.ndarray, sigma_px: float, strength: float) -> np.ndarray:
    c = cavity(h, sigma_px) * 0.6 + cavity(h, sigma_px * 4) * 0.4
    return np.clip(1.0 - strength * c, 0.0, 1.0).astype(np.float32)


def tame(lin_rgb: np.ndarray, sigma_lo_px: float, sigma_hi_px: float, k: float) -> np.ndarray:
    """Soft-clips standout blobs (a knot, a rust hole) whose band-passed log luminance exceeds k standard
    deviations, so a single feature does not become a landmark at every repeat; everything else is untouched."""
    y = luminance(lin_rgb)
    ly = np.log(np.maximum(y, 1e-5))
    band = gaussian_blur(ly, sigma_lo_px) - gaussian_blur(ly, sigma_hi_px)
    lim = k * float(band.std())
    clipped = lim * np.tanh(band / lim)
    return (lin_rgb * np.exp(clipped - band)[..., None]).astype(np.float32)


def equalize(lin_rgb: np.ndarray, sigma_px: float, amount: float) -> np.ndarray:
    """Evens out the local contrast of fine detail (log luminance above sigma_px) toward its mean over the image,
    so smooth and grainy patches of a scan do not show as patches once it is quilted; amount 0..1."""
    y = luminance(lin_rgb)
    ly = np.log(np.maximum(y, 1e-5))
    low = gaussian_blur(ly, sigma_px)
    hp = ly - low
    sd = np.sqrt(np.maximum(gaussian_blur(hp * hp, sigma_px), 1e-12))
    gain = (float(sd.mean()) / sd) ** amount
    return (lin_rgb * np.exp(hp * gain - hp)[..., None]).astype(np.float32)


__all__ = [
    "band_stats",
    "flatten",
    "equalize",
    "desaturate",
    "fit_band",
    "remap",
    "is_flat",
    "unpack_normal",
    "normalize",
    "normal_strength",
    "normal_from_height",
    "cavity",
    "ao_from_height",
    "lum_srgb",
    "smoothstep",
]
