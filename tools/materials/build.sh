#!/usr/bin/env bash
# One-shot material library build: pinned KTX tools, pinned Python environment, restored sources, then
# build.py (graph.json -> assets/materials/). Pass --previews to also re-render docs/art/materials/.
#
#   tools/materials/build.sh [--previews] [build.py options, e.g. --only concrete,grout]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../.." && pwd)"

previews=0
args=()
for a in "$@"; do
  if [[ "${a}" == "--previews" ]]; then previews=1; else args+=("${a}"); fi
done

"${ROOT}/tools/bin/install-ktx.sh"
# the pinned numpy needs Python 3.11 or later; the first `python3` on PATH can be the system's 3.9 (macOS)
pick_python() {
  for py in python3.14 python3.13 python3.12 python3.11 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
    if command -v "${py}" >/dev/null 2>&1 && "${py}" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
      command -v "${py}"
      return 0
    fi
  done
  echo "tools/materials/build.sh: needs Python 3.11 or later for numpy 2.3" >&2
  return 1
}
if [[ ! -x "${HERE}/.venv/bin/python" ]] || ! "${HERE}/.venv/bin/python" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
  rm -rf "${HERE}/.venv"
  "$(pick_python)" -m venv "${HERE}/.venv"
fi
"${HERE}/.venv/bin/pip" install --quiet --disable-pip-version-check -r "${HERE}/requirements.txt"
node "${ROOT}/tools/fetch-assets.mjs" --verify
"${HERE}/.venv/bin/python" "${HERE}/build.py" ${args[@]+"${args[@]}"}

if [[ "${previews}" == 1 ]]; then
  only=()
  for ((i = 0; i < ${#args[@]}; i++)); do
    [[ "${args[i]}" == "--only" ]] && only=(--only "${args[i + 1]}")
  done
  "${ROOT}/tools/blender/run.sh" "${ROOT}/tools/blender/materials/preview.py" ${only[@]+"${only[@]}"}
  "${HERE}/.venv/bin/python" "${HERE}/contact_sheet.py"
fi
