"""Mip chains built by hand (ktx create would filter in sRGB, clamp at edges and not renormalize normals):

- base color is averaged in linear light, 2x2 boxes (exact and periodic for power-of-two tiles);
- normals average the level-0 unit vectors; the shortening of the average measures lost normal variance, which is
  moved into roughness (Toksvig-style specular antialiasing) before the vector is renormalized;
- roughness is averaged as alpha^2 (alpha = roughness^2), AO and metalness linearly.
"""

from __future__ import annotations

import numpy as np

from .imageio import linear_to_srgb
from .periodic import box_down2


def chain_length(size: int) -> int:
    return int(np.log2(size)) + 1


def build(base_lin: np.ndarray, normal: np.ndarray, rough: np.ndarray, ao: np.ndarray, metal: np.ndarray,
          alpha: np.ndarray | None = None, toksvig: float = 1.0, toksvig_cap: float = 0.25) -> dict:
    """Returns {"baseColor": [...], "normal": [...], "orm": [...]} as float images ready to quantize."""
    size = base_lin.shape[0]
    n = chain_length(size)
    out = {"baseColor": [], "normal": [], "orm": []}
    b, a_ = base_lin, alpha
    avg_n = normal.astype(np.float64)
    a2 = (rough.astype(np.float64) ** 2) ** 2
    o, m = ao.astype(np.float64), metal.astype(np.float64)
    for level in range(n):
        if level:
            b = box_down2(b)
            if a_ is not None:
                a_ = box_down2(a_)
            avg_n = box_down2(avg_n)
            a2 = box_down2(a2)
            o, m = box_down2(o), box_down2(m)
        length = np.linalg.norm(avg_n, axis=2, keepdims=True)
        unit = avg_n / np.maximum(length, 1e-6)
        variance = np.clip((1.0 - length) / np.maximum(length, 1e-6), 0.0, None)
        a2_eff = np.clip(a2 + toksvig * np.minimum(2.0 * variance, toksvig_cap), 0.0, 1.0)
        r_eff = a2_eff ** 0.25
        srgb = linear_to_srgb(b.astype(np.float32))
        out["baseColor"].append(np.concatenate([srgb, a_], axis=2) if a_ is not None else srgb)
        out["normal"].append(((unit * 0.5) + 0.5).astype(np.float32))
        out["orm"].append(np.concatenate([o, r_eff, m], axis=2).astype(np.float32))
    return out
