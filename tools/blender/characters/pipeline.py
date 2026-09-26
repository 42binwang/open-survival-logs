"""Paths and helpers shared by the character pipeline (plain Python and Blender's Python).

Layout:
    assets/cache/<source id>/...        downloads, restored from assets/lock/WP-P0-09.json (never committed)
    tools/blender/characters/.work/     intermediates: isolated Blender profile with MPFB, .blend stages, bakes
    assets/characters/<name>/           shipped glTF
    docs/art/characters/                renders
"""

import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
WORK = os.path.join(HERE, ".work")
CACHE = os.path.join(ROOT, "assets", "cache")
LOCK = os.path.join(ROOT, "assets", "lock", "WP-P0-09.json")
LEDGER = os.path.join(ROOT, "assets", "sources.lock.json")
CREDITS = os.path.join(ROOT, "assets", "credits", "WP-P0-09.md")
OUT_DIR = os.path.join(ROOT, "assets", "characters")
RENDERS = os.path.join(ROOT, "docs", "art", "characters")

# Blender runs with its own user profile inside .work so MPFB and its asset packs never touch the user's Blender.
BLENDER_USER = os.path.join(WORK, "blender_user")
MPFB_PACKAGE = "bl_ext.user_default.mpfb"
MPFB_DIR = os.path.join(BLENDER_USER, "extensions", "user_default", "mpfb")
MPFB_USER_DATA = os.path.join(BLENDER_USER, "extensions", ".user", "user_default", "mpfb", "data")

BLENDER = os.environ.get("BLENDER", "/Applications/Blender.app/Contents/MacOS/Blender")


def work(*parts):
    path = os.path.join(WORK, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def cache(source_id, *parts):
    return os.path.join(CACHE, *source_id.split("/"), *parts)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def script_args():
    """Arguments after `--` on a Blender command line (or all of them under plain Python)."""
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]


def setup_cycles(samples, denoise=False):
    """Cycles on the GPU (Metal) when there is one, else the CPU."""
    import bpy  # noqa: PLC0415 (Blender only)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception:  # noqa: BLE001
        scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    scene.cycles.seed = 1
    return scene


def enable_mpfb():
    """Enables MPFB inside a Blender started with BLENDER_USER_RESOURCES=.work/blender_user (see build.py)."""
    import addon_utils  # noqa: PLC0415 (Blender only)

    if not os.path.isdir(MPFB_DIR):
        raise RuntimeError(f"MPFB is not installed in {MPFB_DIR}; run build.py (stage 'setup')")
    mod = addon_utils.enable(MPFB_PACKAGE, default_set=True, handle_error=None)
    if mod is None:
        raise RuntimeError("could not enable MPFB")
    return mod
