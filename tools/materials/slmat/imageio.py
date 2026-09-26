"""Image loading/saving and color transforms."""

from __future__ import annotations

import numpy as np
from PIL import Image

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def load(path: str) -> np.ndarray:
    """Loads an 8/16-bit PNG or JPEG as float32 (H, W, C) in [0, 1]."""
    im = Image.open(path)
    if im.mode in ("I;16", "I;16B", "I;16L", "I"):
        a = np.asarray(im, dtype=np.float32)
        return (a / (65535.0 if a.max() > 255 else 255.0))[..., None]
    if im.mode == "P":
        im = im.convert("RGBA")
    if im.mode not in ("L", "LA", "RGB", "RGBA"):
        im = im.convert("RGB")
    a = np.asarray(im, dtype=np.float32) / 255.0
    return a[..., None] if a.ndim == 2 else a


def load_gray(path: str) -> np.ndarray:
    a = load(path)
    return a[..., :1] if a.shape[2] <= 2 else a[..., :1]


def save_png(path: str, a: np.ndarray, bits: int = 8) -> None:
    a = np.clip(a, 0.0, 1.0)
    if a.ndim == 3 and a.shape[2] == 1:
        a = a[..., 0]
    if bits == 16:
        if a.ndim != 2:
            raise ValueError("16-bit output is only used for single-channel data")
        Image.fromarray(np.round(a * 65535.0).astype(np.uint16)).save(path)
        return
    Image.fromarray(np.round(a * 255.0).astype(np.uint8)).save(path, compress_level=6)


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055).astype(np.float32)


def luminance(lin_rgb: np.ndarray) -> np.ndarray:
    return (lin_rgb[..., :3] @ LUMA).astype(np.float32)


def hex_to_linear(h: str) -> np.ndarray:
    h = h.lstrip("#")
    srgb = np.array([int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)
    return srgb_to_linear(srgb)


def linear_to_hex(lin: np.ndarray) -> str:
    s = np.round(linear_to_srgb(np.asarray(lin, dtype=np.float32)) * 255).astype(int)
    return "#" + "".join(f"{int(v):02x}" for v in s[:3])


def srgb_byte(lin_value: float) -> float:
    """Linear [0,1] -> sRGB 0-255 (float)."""
    return float(linear_to_srgb(np.array([lin_value], dtype=np.float32))[0] * 255.0)
