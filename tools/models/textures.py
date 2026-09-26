"""Encodes the textures of one Poly Haven model into KTX2 (Basis Universal) for tools/models/fetch.mjs.

Usage: python tools/models/textures.py <job.json>   (prints one JSON report line)

The job names each image once, with its role, the locked JPEG it comes from, the KTX2 it becomes and the size
fetch.mjs chose for it (the texel density of ART.md §3). Encoder settings and corrections follow the material
library (tools/materials/build.py, tools/materials/targets.json):

- base color and emissive: sRGB (R8G8B8_SRGB), ETC1S (basis-lz); resampled and mipmapped in linear light;
- normals: linear, UASTC with RDO and zstd; unpacked, kept outward (z >= NORMAL_MIN_Z) and renormalised on every
  level (the art metrics judge every stored mip);
- metallic-roughness ("arm": AO, roughness, metalness) and other data maps: linear ETC1S; roughness is averaged as
  alpha^2 (alpha = roughness^2), AO and metalness linearly.

Corrections, each recorded in the report (and so in the manifest) when it changes a map:

- albedo: the base color luminance of dielectric texels is clamped inside the ART.md §7.2 hard limits
  (linear 0.013-0.90), chroma kept, tightening until every decoded texel is inside (as build.py does);
- roughness: when more than ROUGH_LIMIT of the decoded texels sit at the 8-bit ends (<= 1 or >= 254, the
  roughness-saturation metric), the green channel is mapped linearly into [lo, hi] codes, tightening until the
  decoded map is clear. This removes the clipping, not the variation the scan lost to it.

Mip levels are built by hand down to the smallest level whose sides are still whole 4 x 4 blocks (a size that is not
a power of two stops early; WebGL uploads block-compressed levels only in whole blocks).
Deterministic: fixed tool versions, ktx create with a fixed thread count.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "materials"))
from slmat import imageio as io  # noqa: E402
from slmat import ktx  # noqa: E402
from slmat.periodic import box_down2  # noqa: E402

ALBEDO_MIN = 0.013
ALBEDO_MAX = 0.90
NORMAL_MIN_Z = 0.02
ROUGH_LIMIT = 0.004
# normal-length limits of tools/art-metrics (mean 0.02, p99 0.08) with a margin, on every stored level
NORMAL_MEAN = 0.016
NORMAL_P99 = 0.07
NO_RDO = ["--no-endpoint-rdo", "--no-selector-rdo"]


def levels_for(w: int, h: int) -> int:
    """Mip levels whose sides are whole 4 x 4 blocks (at least one)."""
    n = 1
    while w % 8 == 0 and h % 8 == 0 and w >= 8 and h >= 8:
        w //= 2
        h //= 2
        n += 1
    return n


def resize(a: np.ndarray, w: int, h: int) -> np.ndarray:
    """Area (box) resampling of a float image to w x h, channel by channel (Pillow's exact box filter)."""
    if a.shape[1] == w and a.shape[0] == h:
        return a.astype(np.float32)
    out = [np.asarray(Image.fromarray(a[..., c].astype(np.float32), mode="F").resize((w, h), Image.Resampling.BOX), dtype=np.float32) for c in range(a.shape[2])]
    return np.stack(out, axis=2)


def chain(level0: np.ndarray, n: int, reduce=box_down2) -> list:
    out = [level0]
    for _ in range(1, n):
        out.append(reduce(out[-1]))
    return out


def normalize(n: np.ndarray) -> np.ndarray:
    n = n.astype(np.float64).copy()
    length = np.linalg.norm(n, axis=2, keepdims=True)
    n = n / np.maximum(length, 1e-8)
    n[..., 2] = np.maximum(n[..., 2], NORMAL_MIN_Z)
    return (n / np.linalg.norm(n, axis=2, keepdims=True)).astype(np.float32)


def rgb(a: np.ndarray) -> np.ndarray:
    """Gray (L) images become RGB; alpha is kept."""
    if a.shape[2] == 1:
        return np.repeat(a, 3, axis=2)
    if a.shape[2] == 2:
        return np.concatenate([np.repeat(a[..., :1], 3, axis=2), a[..., 1:]], axis=2)
    return a


def write_levels(levels: list, prefix: str) -> list:
    paths = []
    for i, lv in enumerate(levels):
        p = f"{prefix}_{i:02d}.png"
        io.save_png(p, lv)
        paths.append(p)
    return paths


def encode(levels: list, out: str, fmt: str, tf: str, args: list, work: str, name: str) -> dict:
    files = write_levels(levels, os.path.join(work, name))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    res = ktx.create(files, out, fmt, tf, args, "bt709" if tf == "srgb" else "none")
    for f in files:
        os.remove(f)
    return {"psnr": res["psnr0"]}


def decode(path: str, work: str) -> np.ndarray:
    tmp = os.path.join(work, "decoded.png")
    ktx.extract_level0(path, tmp)
    a = np.asarray(Image.open(tmp).convert("RGBA"), dtype=np.uint8)
    os.remove(tmp)
    return a


def load_mask(job: dict, w: int, h: int) -> np.ndarray:
    """The texels inside the UV islands that sample the image (fetch.mjs rasterises them as the art metrics do)."""
    if not job.get("mask"):
        return np.ones((h, w), dtype=bool)
    m = np.asarray(Image.open(job["mask"]).convert("L"), dtype=np.uint8) > 127
    if m.shape != (h, w):
        raise SystemExit(f"{job['mask']}: mask {m.shape} is not {h} x {w}")
    return m if m.any() else np.ones((h, w), dtype=bool)


def pct(v: np.ndarray) -> list:
    return [round(float(x), 4) for x in np.percentile(v, [0.5, 99.5])]


def decode_level(path: str, work: str, level: int) -> np.ndarray:
    tmp = os.path.join(work, f"decoded{level}.png")
    res = subprocess.run([ktx.ktx_bin(), "extract", "--transcode", "rgba8", "--level", str(level), path, tmp], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ktx extract failed: {res.stderr}")
    a = np.asarray(Image.open(tmp).convert("RGBA"), dtype=np.uint8)
    os.remove(tmp)
    return a


def metal_map(job: dict, w: int, h: int) -> np.ndarray:
    """Per-texel metalness at w x h, sampled nearest as the art metrics do (blue x metallicFactor, or the factor
    alone), the least of the materials that show this base color: a texel counts as metal only if it is in all."""
    ms = job.get("metal") or []
    if not ms:
        return np.zeros((h, w), dtype=np.float32)
    out = np.ones((h, w), dtype=np.float32)
    for m in ms:
        if not m.get("src"):
            v = np.full((h, w), float(m.get("factor", 1.0)), dtype=np.float32)
        else:
            a = rgb(io.load(m["src"]))[..., 2]
            ys = np.minimum(a.shape[0] - 1, (np.arange(h) * a.shape[0]) // h)
            xs = np.minimum(a.shape[1] - 1, (np.arange(w) * a.shape[1]) // w)
            v = a[ys][:, xs].astype(np.float32) * float(m.get("factor", 1.0))
        out = np.minimum(out, v)
    return out


def base_color(job: dict, work: str, enc: dict) -> dict:
    src = rgb(io.load(job["src"]))
    w, h = job["size"]
    lin = io.srgb_to_linear(src[..., :3])
    alpha = src[..., 3:] if src.shape[2] == 4 else None
    lin = resize(lin, w, h)
    if alpha is not None:
        alpha = resize(alpha, w, h)
    n = levels_for(w, h)
    fmt = "R8G8B8A8_SRGB" if alpha is not None else "R8G8B8_SRGB"
    clamp = job["role"] == "baseColor" and not job.get("transmissive")
    metal = metal_map(job, w, h)
    mask = load_mask(job, w, h)
    diel = metal <= 0.5
    judged = diel & mask
    metals = ~diel & mask
    judge = judged.sum() >= 0.01 * mask.sum()
    raw = lin.copy()
    report = {"format": fmt, "transfer": "srgb", "levels": n}
    before = io.luminance(raw)
    if clamp and judge:
        report["albedoBefore"] = pct(before[judged])
    etc1s, uastc = enc["baseColor"], enc["fallback"]
    attempts = (
        ((1.15, 0.97, etc1s, "etc1s"), (1.15, 0.97, etc1s + NO_RDO, "etc1s"), (1.4, 0.94, etc1s + NO_RDO, "etc1s"), (1.15, 0.97, uastc, "uastc"), (1.4, 0.94, uastc, "uastc"))
        if clamp
        else ((1, 1, etc1s, "etc1s"),)
    )
    for lo_k, hi_k, args, codec in attempts:
        cur = raw
        if clamp:
            # the floor on every texel (below any metal's F0, so harmless there), the ceiling on dielectric texels
            y = io.luminance(raw)
            yc = np.maximum(y, ALBEDO_MIN * lo_k)
            yc = np.where(diel, np.minimum(yc, ALBEDO_MAX * hi_k), yc)
            # scaled, chroma kept; a texel too dark to scale (pure black) becomes the neutral grey of its luminance
            cur = np.where((y > 1e-4)[..., None], raw * (yc / np.maximum(y, 1e-4))[..., None], yc[..., None])
            changed = float((np.abs(yc - y) > 1e-6).mean())
        levels = chain(np.concatenate([cur, alpha], axis=2) if alpha is not None else cur, n)
        levels = [np.concatenate([io.linear_to_srgb(lv[..., :3]), lv[..., 3:]], axis=2) for lv in levels]
        r = encode(levels, job["out"], fmt, "srgb", args, work, "base")
        if not clamp:
            break
        shown = io.luminance(io.srgb_to_linear(decode(job["out"], work)[..., :3].astype(np.float32) / 255.0))
        if not judge:
            break
        lo, hi = pct(shown[judged])
        report["albedo"] = [lo, hi]
        if lo >= ALBEDO_MIN and hi <= ALBEDO_MAX:
            break
    else:
        report["albedoOutsideLimits"] = True
    report["codec"] = codec
    if clamp and metals.sum() >= 0.01 * mask.sum():
        report["metalF0"] = pct(shown[metals])
    report.update(r)
    if clamp and changed > 0:
        report["correction"] = {
            "albedoClamp": [round(ALBEDO_MIN * lo_k, 4), round(ALBEDO_MAX * hi_k, 4)],
            "texelsChanged": round(changed, 4),
            **({"encoderArgs": args} if args is not etc1s else {}),
        }
    return report


def level_mask(mask: np.ndarray, level: int) -> np.ndarray:
    """The level-0 coverage pooled to a mip level (a texel is kept when any texel under it is)."""
    k = 1 << level
    h, w = mask.shape[0] // k, mask.shape[1] // k
    return mask[: h * k, : w * k].reshape(h, k, w, k).any(axis=(1, 3))


def normal_errors(path: str, work: str, n: int, mask: np.ndarray) -> list:
    """[mean, p99] length error (|decoded xyz| - 1) of each stored level of 4 x 4 and up, inside the UV islands."""
    out = []
    for level in range(n):
        a = decode_level(path, work, level)
        if min(a.shape[:2]) < 4:
            break
        v = a[..., :3].astype(np.float64) / 127.5 - 1.0
        err = np.abs(np.linalg.norm(v, axis=2) - 1.0)[level_mask(mask, level)]
        out.append([round(float(err.mean()), 4), round(float(np.percentile(err, 99)), 4)] if err.size else [0.0, 0.0])
    return out


def normal(job: dict, work: str, enc: dict) -> dict:
    src = rgb(io.load(job["src"]))[..., :3]
    w, h = job["size"]
    n0 = normalize(resize(normalize(src * 2.0 - 1.0), w, h))
    n = levels_for(w, h)
    levels = [(lv * 0.5 + 0.5).astype(np.float32) for lv in chain(n0, n, lambda a: normalize(box_down2(a)))]
    mask = load_mask(job, w, h)
    report = {"format": "R8G8B8_UNORM", "transfer": "linear", "codec": "uastc"}
    ok = lambda e: e[0] <= NORMAL_MEAN and e[1] <= NORMAL_P99  # noqa: E731
    # the library's RDO settings first; when RDO costs more than the limits allow, UASTC without it; when a small
    # level still cannot hold unit length (UASTC fits colours, not lengths, and a 16 px level of a scan mixes
    # unrelated normals in a block), the chain stops above it: the renderer samples the last stored level below that
    for args in (enc["normal"], enc["normalExact"]):
        r = encode(levels, job["out"], "R8G8B8_UNORM", "linear", args, work, "normal")
        errs = normal_errors(job["out"], work, n, mask)
        if all(ok(e) for e in errs):
            break
    kept = n
    if not all(ok(e) for e in errs):
        kept = max(1, next(i for i, e in enumerate(errs) if not ok(e)))
        r = encode(levels[:kept], job["out"], "R8G8B8_UNORM", "linear", args, work, "normal")
        errs = normal_errors(job["out"], work, kept, mask)
    report["levels"] = kept
    report["lengthError"] = [max(e[0] for e in errs), max(e[1] for e in errs)] if errs else [0.0, 0.0]
    report.update(r)
    corr = {}
    if args is not enc["normal"]:
        corr["encoderArgs"] = args
    if kept < n:
        corr["levelsKept"] = kept
    if corr:
        report["correction"] = corr
    return report


def data(job: dict, work: str, enc: dict) -> dict:
    """Metallic-roughness (and other linear) maps: ETC1S, roughness conditioned against clipping (UASTC when ETC1S
    cannot keep it off the ends)."""
    src = rgb(io.load(job["src"]))
    w, h = job["size"]
    n = levels_for(w, h)
    mr = job["role"] == "orm"

    def down(a: np.ndarray) -> np.ndarray:
        if not mr:
            return box_down2(a)
        out = box_down2(a)
        out[..., 1] = box_down2(a[..., 1:2] ** 4)[..., 0] ** 0.25
        return out

    if mr:
        lv0 = resize(src, w, h)
        lv0[..., 1] = resize(src[..., 1:2] ** 4, w, h)[..., 0] ** 0.25
    else:
        lv0 = resize(src, w, h)
    ch = lv0.shape[2]
    fmt = "R8G8B8A8_UNORM" if ch == 4 else "R8G8B8_UNORM"
    report = {"format": fmt, "transfer": "linear", "levels": n}
    etc1s, uastc = enc["orm"], enc["fallback"]
    attempts = ((None, etc1s, "etc1s"), ((3, 252), etc1s, "etc1s"), ((6, 249), etc1s + NO_RDO, "etc1s"), ((3, 252), uastc, "uastc"), ((6, 249), uastc, "uastc")) if mr else ((None, etc1s, "etc1s"),)
    for lohi, args, codec in attempts:
        cur = lv0
        if lohi:
            lo, hi = lohi[0] / 255.0, lohi[1] / 255.0
            cur = lv0.copy()
            cur[..., 1] = lo + (hi - lo) * np.clip(lv0[..., 1], 0.0, 1.0)
        r = encode(chain(cur, n, down), job["out"], fmt, "linear", args, work, "data")
        if not mr:
            break
        g = decode(job["out"], work)[..., 1][load_mask(job, w, h)]
        share = float(((g <= 1) | (g >= 254)).mean())
        if lohi is None:
            report["roughnessClippedBefore"] = round(share, 4)
        if share <= ROUGH_LIMIT:
            break
    else:
        report["roughnessClipped"] = round(share, 4)
    report["codec"] = codec
    report.update(r)
    if mr and lohi:
        report["correction"] = {"roughnessRange": list(lohi), **({"encoderArgs": args} if args is not etc1s else {})}
    return report


def main() -> None:
    job = json.load(open(sys.argv[1]))
    enc = job["encode"]
    work = tempfile.mkdtemp(prefix="models-ktx-")
    try:
        out = {}
        for img in job["images"]:
            role = img["role"]
            if role in ("baseColor", "color"):
                out[img["out"]] = base_color(img, work, enc)
            elif role == "normal":
                out[img["out"]] = normal(img, work, enc)
            else:
                out[img["out"]] = data(img, work, enc)
            out[img["out"]]["size"] = img["size"]
        print(json.dumps(out, sort_keys=True))
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
