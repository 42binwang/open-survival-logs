#!/usr/bin/env bash
# Headless Blender entry point for every pipeline script.
#
#   tools/blender/run.sh <script.py> [args...]
#
# Runs Blender in the background with factory settings (no user prefs or add-ons leak in), puts tools/blender/
# on sys.path (so scripts can `import common` and `import materials`), passes [args...] after `--`
# (read them with common.args.parse), and exits non-zero if the script raises.
# Blender is found via $BLENDER, then /Applications/Blender.app, then `blender` on PATH.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: tools/blender/run.sh <script.py> [args...]" >&2
  exit 2
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$1"
shift
[[ -f "${script}" ]] || { echo "no such script: ${script}" >&2; exit 2; }
script="$(cd "$(dirname "${script}")" && pwd)/$(basename "${script}")"

blender="${BLENDER:-}"
if [[ -z "${blender}" ]]; then
  if [[ -x /Applications/Blender.app/Contents/MacOS/Blender ]]; then
    blender=/Applications/Blender.app/Contents/MacOS/Blender
  elif command -v blender >/dev/null 2>&1; then
    blender="$(command -v blender)"
  else
    echo "Blender not found (set BLENDER=/path/to/blender)" >&2
    exit 1
  fi
fi

export SL_REPO_ROOT="$(cd "${HERE}/../.." && pwd)"
exec "${blender}" --background --factory-startup -noaudio --python-exit-code 1 \
  --python-expr "import sys; sys.path.insert(0, '${HERE}')" \
  --python "${script}" -- "$@"
