"""Repository paths."""

from __future__ import annotations

import os

ROOT = os.environ.get("SL_REPO_ROOT") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def repo(*parts: str) -> str:
    return os.path.join(ROOT, *parts)


def ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def ktx_bin() -> str:
    local = repo("tools", "bin", "ktx")
    if os.access(local, os.X_OK):
        return local
    raise SystemExit("tools/bin/ktx missing: run tools/bin/install-ktx.sh")
