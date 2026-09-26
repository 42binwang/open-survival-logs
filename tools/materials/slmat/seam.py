"""Tileable crops: take a window smaller than the (tiling) source and repair its wrap seams.

The window is extended by an overlap band past its right and bottom edges. That band continues the window's
right/bottom edge in the source, so pasting it over the window's own left/top band — split along a minimum-error
cut (Efros & Freeman 2001 image quilting) — makes the wrap continuous while the cut hides inside the texture.
All maps of a material are stacked into one array so they share the same cut.
"""

from __future__ import annotations

import numpy as np

from .periodic import crop


def _cost(a: np.ndarray, b: np.ndarray, weights: np.ndarray) -> np.ndarray:
    d = (a - b) ** 2
    return (d * weights[None, None, :]).sum(axis=2)


def _edge_penalty(width: int, strength: float) -> np.ndarray:
    t = np.linspace(0.0, 1.0, width)
    return strength * (np.clip(1.0 - t / 0.15, 0, 1) ** 2 + np.clip((t - 0.85) / 0.15, 0, 1) ** 2)


def min_cut(cost: np.ndarray) -> np.ndarray:
    """Vertical minimum-cost path through cost (rows x cols); returns one column index per row."""
    rows, cols = cost.shape
    acc = cost.copy()
    back = np.zeros((rows, cols), dtype=np.int8)
    for i in range(1, rows):
        prev = acc[i - 1]
        left = np.concatenate(([np.inf], prev[:-1]))
        right = np.concatenate((prev[1:], [np.inf]))
        stack = np.stack([left, prev, right])
        k = np.argmin(stack, axis=0)
        acc[i] += stack[k, np.arange(cols)]
        back[i] = k - 1
    path = np.empty(rows, dtype=np.int64)
    path[-1] = int(np.argmin(acc[-1]))
    for i in range(rows - 1, 0, -1):
        path[i - 1] = path[i] + back[i, path[i]]
    return path


def min_cut_closed(cost: np.ndarray, candidates: int = 24) -> np.ndarray:
    """Like min_cut, but the path must end within one column of where it starts (periodic along rows)."""
    rows, cols = cost.shape
    best, best_path = np.inf, None
    for c0 in np.unique(np.linspace(2, cols - 3, candidates).astype(int)):
        acc = np.full(cols, np.inf)
        acc[c0] = cost[0, c0]
        back = np.zeros((rows, cols), dtype=np.int8)
        for i in range(1, rows):
            left = np.concatenate(([np.inf], acc[:-1]))
            right = np.concatenate((acc[1:], [np.inf]))
            stack = np.stack([left, acc, right])
            k = np.argmin(stack, axis=0)
            acc = stack[k, np.arange(cols)] + cost[i]
            back[i] = k - 1
        lo, hi = max(c0 - 1, 0), min(c0 + 2, cols)
        end = lo + int(np.argmin(acc[lo:hi]))
        if acc[end] < best:
            best = acc[end]
            path = np.empty(rows, dtype=np.int64)
            path[-1] = end
            for i in range(rows - 1, 0, -1):
                path[i - 1] = path[i] + back[i, path[i]]
            best_path = path
    assert best_path is not None
    return best_path


def _blend_mask(path: np.ndarray, width: int, feather: int) -> np.ndarray:
    """0 left of the cut (take the continuation band), 1 right of it (keep the window), ramped over the feather."""
    cols = np.arange(width)[None, :]
    t = (cols - path[:, None] + feather) / max(2 * feather, 1)
    return np.clip(t, 0.0, 1.0).astype(np.float32)


def tileable_crop(
    stack: np.ndarray, y0: int, x0: int, size: int, overlap: int, weights: np.ndarray, feather: int = 3
) -> tuple[np.ndarray, dict]:
    """Returns a (size, size, C) window of the periodic `stack` whose wrap seams are repaired."""
    ext = crop(stack, y0, x0, size + overlap, size + overlap).copy()
    scale = ext.reshape(-1, ext.shape[2]).std(axis=0) + 1e-6
    w = (weights / scale**2).astype(np.float32)

    # Left band: continuation of the right edge (cols size..size+overlap) vs the window's own first columns.
    a, b = ext[:, size : size + overlap], ext[:, :overlap]
    cost = _cost(a, b, w)
    cost += _edge_penalty(overlap, float(np.median(cost)) * 4.0)[None, :]
    path_v = min_cut(cost)
    m = _blend_mask(path_v, overlap, feather)[..., None]
    ext[:, :overlap] = a * (1 - m) + b * m

    # Top band over the first `size` columns; the cut must close on itself so the corner wraps too.
    a, b = ext[size : size + overlap, :size], ext[:overlap, :size]
    cost = _cost(a, b, w).T
    cost += _edge_penalty(overlap, float(np.median(cost)) * 4.0)[None, :]
    path_h = min_cut_closed(cost)
    m = _blend_mask(path_h, overlap, feather).T[..., None]
    ext[:overlap, :size] = a * (1 - m) + b * m

    out = ext[:size, :size]
    info = {
        "cutV": {"min": int(path_v.min()), "max": int(path_v.max())},
        "cutH": {"min": int(path_h.min()), "max": int(path_h.max())},
        "overlap": overlap,
    }
    return out, info
