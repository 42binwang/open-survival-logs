#!/usr/bin/env bash
# UI fonts: pinned Python environment, restored font sources, then build.py (assets/fonts/ and its manifest).
#
#   tools/fonts/build.sh [--only noto-sans,noto-sans-sc]
#   tools/fonts/build.sh --collect      refresh tools/fonts/charset.json after the game's strings change
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../.." && pwd)"

if [[ ! -x "${HERE}/.venv/bin/python" ]]; then
  python3 -m venv "${HERE}/.venv"
fi
"${HERE}/.venv/bin/pip" install --quiet --disable-pip-version-check -r "${HERE}/requirements.txt"
if [[ " $* " != *" --collect "* ]]; then
  node "${ROOT}/tools/fetch-assets.mjs" --verify --only googlefonts/notosans@b5efa9c32e8f --only googlefonts/notosanssc@b5efa9c32e8f
fi
"${HERE}/.venv/bin/python" "${HERE}/build.py" "$@"
