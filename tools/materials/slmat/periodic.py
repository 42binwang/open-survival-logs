"""Periodic (wrap-around) resampling, blurring and cropping."""

from __future__ import annotations

import numpy as np


def _lanczos(x: np.ndarray, a: int = 3) -> np.ndarray:
    x = np.abs(x)
    out = np.sinc(x) * np.sinc(x / a)
    out[x >= a] = 0.0
    return out


def resample_matrix(n_in: int, n_out: int, periods: float = 1.0, a: int = 3) -> np.ndarray:
    """(n_out, n_in) matrix sampling `periods` repeats of a periodic signal of length n_in into n_out samples.

    Uses a Lanczos-a kernel widened by the reduction factor (antialiased); taps wrap around.
    """
    step = periods * n_in / n_out
    width = max(step, 1.0)
    m = np.zeros((n_out, n_in), dtype=np.float64)
    centers = (np.arange(n_out) + 0.5) * step - 0.5
    radius = int(np.ceil(a * width)) + 1
    offs = np.arange(-radius, radius + 1)
    for i, c in enumerate(centers):
        taps = np.floor(c).astype(int) + offs
        w = _lanczos((taps - c) / width, a)
        w /= w.sum()
        np.add.at(m[i], np.mod(taps, n_in), w)
    return m.astype(np.float32)


def resample(img: np.ndarray, out_h: int, out_w: int, periods_y: float = 1.0, periods_x: float = 1.0) -> np.ndarray:
    """Resamples a periodic image; periods_* > 1 packs that many repeats into the output."""
    h, w, c = img.shape
    my = resample_matrix(h, out_h, periods_y)
    mx = resample_matrix(w, out_w, periods_x)
    out = np.empty((out_h, out_w, c), dtype=np.float32)
    for k in range(c):
        out[..., k] = my @ img[..., k] @ mx.T
    return out


def box_down2(img: np.ndarray) -> np.ndarray:
    """Exact 2x2 box reduction (periodicity preserved for even sizes)."""
    h, w = img.shape[:2]
    if h == 1 and w == 1:
        return img.copy()
    hh, ww = max(h // 2, 1), max(w // 2, 1)
    if h == 1:
        return img.reshape(1, ww, 2, -1).mean(axis=2)
    if w == 1:
        return img.reshape(hh, 2, 1, -1).mean(axis=1)
    return img.reshape(hh, 2, ww, 2, -1).mean(axis=(1, 3))


def gaussian_blur(img: np.ndarray, sigma_px: float) -> np.ndarray:
    """Periodic Gaussian blur through the FFT (exact wrap-around)."""
    if sigma_px <= 0:
        return img.copy()
    h, w = img.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    g = np.exp(-2.0 * (np.pi * sigma_px) ** 2 * (fx * fx + fy * fy)).astype(np.float32)
    if img.ndim == 2:
        return np.fft.irfft2(np.fft.rfft2(img) * g, s=(h, w)).astype(np.float32)
    out = np.empty_like(img)
    for k in range(img.shape[2]):
        out[..., k] = np.fft.irfft2(np.fft.rfft2(img[..., k]) * g, s=(h, w))
    return out


def crop(img: np.ndarray, y0: int, x0: int, h: int, w: int) -> np.ndarray:
    """Crop with wrap-around indexing (the source tiles, so any window is valid)."""
    ys = np.mod(np.arange(y0, y0 + h), img.shape[0])
    xs = np.mod(np.arange(x0, x0 + w), img.shape[1])
    return img[ys][:, xs]


def roll_half(img: np.ndarray) -> np.ndarray:
    return np.roll(np.roll(img, img.shape[0] // 2, axis=0), img.shape[1] // 2, axis=1)


def heal_wrap(img: np.ndarray, axis: int, k: int = 6) -> np.ndarray:
    """Removes the excess step across the wrap boundary along `axis` (gradient domain).

    The step between the last and first line is replaced by the average of the neighbouring steps; the correction
    is spread linearly over k lines on each side, so detail is kept and no blur is introduced.
    """
    a = np.moveaxis(img, axis, 0).copy()
    step = a[0] - a[-1]
    expected = 0.5 * ((a[1] - a[0]) + (a[-1] - a[-2]))
    excess = step - expected
    for j in range(k):
        w = 0.5 * (1.0 - j / k)
        a[j] -= excess * w
        a[-1 - j] += excess * w
    return np.moveaxis(a, 0, axis)


def high_pass(img: np.ndarray, sigma_px: float, strength: float = 1.0) -> np.ndarray:
    """Subtracts the low frequencies (periodic Gaussian) and keeps the mean."""
    low = gaussian_blur(img, sigma_px)
    mean = img.reshape(-1, img.shape[-1]).mean(axis=0) if img.ndim == 3 else img.mean()
    return (img - strength * (low - mean)).astype(np.float32)
