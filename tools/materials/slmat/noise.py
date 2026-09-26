"""Periodic noise by spectral synthesis (tiles by construction) and histogram equalization."""

from __future__ import annotations

import numpy as np


def spectral(size: int, beta: float, fmin: float, fmax: float, rng: np.random.Generator) -> np.ndarray:
    """Zero-mean, unit-variance periodic noise with power spectrum ~ f^-beta between fmin and fmax (cycles/tile)."""
    white = rng.standard_normal((size, size)).astype(np.float32)
    spec = np.fft.rfft2(white)
    fy = np.fft.fftfreq(size)[:, None] * size
    fx = np.fft.rfftfreq(size)[None, :] * size
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    # Smooth band edges (in octaves) so no ringing lattice shows up.
    lo = np.clip((np.log2(f) - np.log2(fmin)) / 0.5 + 1.0, 0.0, 1.0)
    hi = np.clip((np.log2(fmax) - np.log2(f)) / 0.5 + 1.0, 0.0, 1.0)
    amp = amp * lo * hi
    amp[0, 0] = 0.0
    n = np.fft.irfft2(spec * amp, s=(size, size)).astype(np.float32)
    n -= n.mean()
    return n / (n.std() + 1e-8)


def equalize(n: np.ndarray) -> np.ndarray:
    """Maps values to their rank in [0, 1]: a uniform distribution, so a threshold t covers a fraction 1 - t."""
    flat = n.ravel()
    order = np.argsort(flat, kind="stable")
    ranks = np.empty_like(order)
    ranks[order] = np.arange(flat.size)
    return (ranks.astype(np.float32) / (flat.size - 1)).reshape(n.shape)


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)
