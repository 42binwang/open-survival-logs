#!/usr/bin/env bash
# The icon build (WP-P0-12) and the rebuild recipe of assets/icons/manifest.json: pinned Blender and KTX tools, the
# locked studio HDRI restored into assets/cache/, the label art (labels.mjs), the Cycles renders with the fixed rig
# (render.py), then the downsampled sizes, badges and the manifest (finish.mjs).
#
#   tools/blender/icons/build.sh [--only 2115,2105] [--sheets]
#
# --sheets also renders the builder demos (demo.py) and redraws the contact sheets in docs/art/icons/ (review
# images, not shipped).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${HERE}/../../.." && pwd)"
BLENDER_VERSION="5.2.2"

only=""
sheets=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --only) only="$2"; shift 2 ;;
    --sheets) sheets=1; shift ;;
    *) echo "usage: $0 [--only 2115,2105] [--sheets]" >&2; exit 2 ;;
  esac
done

blender="${BLENDER:-}"
if [[ -z "${blender}" ]]; then
  if [[ -x /Applications/Blender.app/Contents/MacOS/Blender ]]; then
    blender=/Applications/Blender.app/Contents/MacOS/Blender
  elif command -v blender >/dev/null 2>&1; then
    blender="$(command -v blender)"
  else
    echo "Blender ${BLENDER_VERSION} not found (set BLENDER=/path/to/blender)" >&2
    exit 1
  fi
fi
have="$("${blender}" --version 2>/dev/null | sed -n 's/^Blender \([0-9][0-9.]*\).*/\1/p' | head -1)"
if [[ "${have}" != "${BLENDER_VERSION}" ]]; then
  echo "the icon renders are pinned to Blender ${BLENDER_VERSION}; ${blender} is ${have:-unknown}" >&2
  exit 1
fi
export BLENDER="${blender}"

"${ROOT}/tools/bin/install-ktx.sh" >/dev/null
node "${ROOT}/tools/fetch-assets.mjs" --verify --only polyhaven/studio_small_09@2k >/dev/null

work="${HERE}/work"
args=()
[[ -n "${only}" ]] && args=(--only "${only}")
if [[ -z "${only}" ]]; then
  rm -rf "${work}/render"
else
  IFS=',' read -r -a ids <<< "${only}"
  for id in "${ids[@]}"; do rm -f "${work}/render/${id}.png" "${work}/render/${id}.json"; done
fi
node "${HERE}/labels.mjs" --out "${work}/labels" >/dev/null
"${ROOT}/tools/blender/run.sh" "${HERE}/render.py" --work "${work}" ${args[@]+"${args[@]}"}
node "${HERE}/finish.mjs" --work "${work}" ${args[@]+"${args[@]}"}
if [[ "${sheets}" == 1 ]]; then
  "${ROOT}/tools/blender/run.sh" "${HERE}/demo.py" --work "${work}"
  node "${HERE}/contact.mjs"
fi
