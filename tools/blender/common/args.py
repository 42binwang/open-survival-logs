"""Argument parsing for scripts started by tools/blender/run.sh (arguments follow Blender's `--`)."""

from __future__ import annotations

import argparse
import sys


def script_argv() -> list[str]:
    argv = sys.argv
    return argv[argv.index("--") + 1 :] if "--" in argv else []


def parser(description: str) -> argparse.ArgumentParser:
    return argparse.ArgumentParser(description=description, prog="tools/blender/run.sh <script.py>")


def parse(p: argparse.ArgumentParser) -> argparse.Namespace:
    return p.parse_args(script_argv())
