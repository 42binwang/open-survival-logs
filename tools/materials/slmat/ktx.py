"""Thin wrapper over the KTX-Software CLI installed in tools/bin (tools/bin/install-ktx.sh)."""

from __future__ import annotations

import os
import re
import shutil
import subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
KTX_VERSION = "4.4.2"


def ktx_bin() -> str:
    local = os.path.join(ROOT, "tools", "bin", "ktx")
    if os.access(local, os.X_OK):
        return local
    found = shutil.which("ktx")
    if not found:
        raise SystemExit("ktx not found: run tools/bin/install-ktx.sh")
    return found


def version() -> str:
    out = subprocess.run([ktx_bin(), "--version"], capture_output=True, text=True, check=True).stdout
    m = re.search(r"v?(\d+\.\d+\.\d+)", out)
    return m.group(1) if m else out.strip()


def create(levels: list[str], out_path: str, fmt: str, transfer: str, encode_args: list[str], primaries: str) -> dict:
    """Encodes pre-built mip levels (level 0 first) into a KTX2 file; returns the reported PSNR if any."""
    cmd = [
        ktx_bin(), "create",
        "--format", fmt,
        "--assign-tf", transfer,
        "--assign-primaries", primaries,
        "--levels", str(len(levels)),
        # A fixed thread count keeps the output byte-identical across machines (the encoders split work per thread).
        "--threads", "8",
        "--testrun",
        "--compare-psnr",
        *encode_args,
        *levels,
        out_path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ktx create failed ({res.returncode}): {' '.join(cmd)}\n{res.stderr}{res.stdout}")
    m = re.search(r"Level 0:\s*PSNR:\s*([0-9]+(?:\.[0-9]+)?)", res.stdout)
    return {"psnr0": float(m.group(1)) if m else None}


def extract_level0(ktx_path: str, png_path: str) -> None:
    cmd = [ktx_bin(), "extract", "--transcode", "rgba8", "--level", "0", ktx_path, png_path]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ktx extract failed: {' '.join(cmd)}\n{res.stderr}")
