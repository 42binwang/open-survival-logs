"""Periodic image quilting: a non-repeating tile larger than the scan (Efros & Freeman 2001, on a torus).

The output (size x size texels, periodic) is a grid of blocks. Each block is a window of the periodic source at an
offset picked among random candidates for the least squared difference with what is already placed around it; the
overlap strips are then joined along minimum-error cuts, including the strips that close the torus (the last
column against the first, the last row against the first). The source's own period never survives as an exact
period of the output, so the tile does not equal itself shifted by any fraction of its size.
All maps of a material are quilted together (one stack), so they share every cut.
"""

from __future__ import annotations

import zlib

import numpy as np

from .periodic import crop
from .seam import min_cut


def _mask_from_cut(path: np.ndarray, width: int, keep_old_before: bool, feather: int = 2) -> np.ndarray:
    """(rows, width) weight of the new patch: 0 on the old side of the cut, 1 on the new side, ramped."""
    cols = np.arange(width)[None, :]
    t = np.clip((cols - path[:, None] + feather) / max(2 * feather, 1), 0.0, 1.0)
    return (t if keep_old_before else 1.0 - t).astype(np.float32)


def _edges(size: int, block: int, jitter: float, rng: np.random.Generator) -> np.ndarray:
    """Block edges 0..size: a regular grid, or block sizes jittered by +-jitter (no fixed period) summing to size."""
    n = size // block
    if jitter <= 0:
        return np.arange(n + 1) * block
    wd = block * (1.0 + jitter * rng.uniform(-1.0, 1.0, n))
    return np.round(np.concatenate([[0.0], np.cumsum(wd * size / wd.sum())])).astype(int)


def quilt(
    src: np.ndarray, size: int, block: int, overlap: int, weights: np.ndarray, seed_text: str, candidates: int = 64, jitter: float = 0.0, feather: int = 2
) -> tuple[np.ndarray, dict]:
    """Returns (size, size, C) quilted from the periodic source (h, w, C) and a report."""
    if size % block:
        raise ValueError(f"block {block} does not divide the tile {size}")
    h, w, c = src.shape
    rng = np.random.default_rng(zlib.crc32(seed_text.encode()))
    xe, ye = _edges(size, block, jitter, rng), _edges(size, block, jitter, rng)
    big = int(max(np.diff(xe).max(), np.diff(ye).max()))
    if big + overlap > min(h, w) or min(np.diff(xe).min(), np.diff(ye).min()) <= overlap:
        raise ValueError(f"blocks of {block} px (jitter {jitter}) + overlap {overlap} do not fit the source {w}x{h}")
    scale = src.reshape(-1, c).std(axis=0) + 1e-6
    wt = (weights / scale**2).astype(np.float32)
    grid = size // block
    canvas = np.zeros((size, size, c), np.float32)
    filled = np.zeros((size, size), bool)
    offsets = []
    for gy in range(grid):
        for gx in range(grid):
            ys = np.mod(np.arange(ye[gy] - overlap, ye[gy + 1]), size)
            xs = np.mod(np.arange(xe[gx] - overlap, xe[gx + 1]), size)
            ph, pw = len(ys), len(xs)
            old = canvas[ys][:, xs]
            known = filled[ys][:, xs]
            best, best_patch, best_off = np.inf, None, None
            for _ in range(candidates if known.any() else 1):
                oy, ox = int(rng.integers(0, h)), int(rng.integers(0, w))
                patch = crop(src, oy, ox, ph, pw)
                err = float((((patch - old) ** 2) * wt).sum(axis=2)[known].sum()) if known.any() else 0.0
                if err < best:
                    best, best_patch, best_off = err, patch, (oy, ox)
            patch = best_patch
            m = np.ones((ph, pw), np.float32)
            cost = (((patch - old) ** 2) * wt).sum(axis=2)
            # left strip (old on the left), top strip (old on top)
            if known[:, :overlap].all():
                m[:, :overlap] *= _mask_from_cut(min_cut(cost[:, :overlap]), overlap, True, feather)
            if known[:overlap, :].all():
                m[:overlap, :] *= _mask_from_cut(min_cut(cost[:overlap, :].T), overlap, True, feather).T
            # closing strips: the right edge of the last column meets column 0's left overlap, the bottom of the
            # last row meets row 0's top overlap
            if gx == grid - 1 and known[:, pw - overlap :].all():
                m[:, pw - overlap :] *= _mask_from_cut(min_cut(cost[:, pw - overlap :]), overlap, False, feather)
            if gy == grid - 1 and known[ph - overlap :, :].all():
                m[ph - overlap :, :] *= _mask_from_cut(min_cut(cost[ph - overlap :, :].T), overlap, False, feather).T
            m = np.where(known, m, 1.0)[..., None]
            canvas[np.ix_(ys, xs)] = old * (1.0 - m) + patch * m
            filled[np.ix_(ys, xs)] = True
            offsets.append(best_off)
    info = {"block": block, "overlap": overlap, "grid": grid, "candidates": candidates, "sourcePx": [w, h]}
    if jitter > 0:
        info.update({"jitter": jitter, "feather": feather})
    elif feather != 2:
        info["feather"] = feather
    return canvas, info
