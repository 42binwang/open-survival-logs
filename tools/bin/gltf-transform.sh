#!/usr/bin/env bash
# Runs the pinned glTF Transform CLI (meshopt, etc1s/uastc texture compression, inspect, optimize) with the
# pinned KTX-Software tools from tools/bin first on PATH.
#
#   tools/bin/gltf-transform.sh <command> [args...]      e.g. optimize in.glb out.glb --compress meshopt
#
# Uses node_modules/.bin/gltf-transform once @gltf-transform/cli is a devDependency, npx until then.
set -euo pipefail

VERSION="4.5.0"
BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${BIN_DIR}/../.." && pwd)"

if ! "${BIN_DIR}/install-ktx.sh" --check >/dev/null 2>&1; then
  "${BIN_DIR}/install-ktx.sh" >&2 || echo "warning: KTX tools unavailable; etc1s/uastc commands will fail" >&2
fi
export PATH="${BIN_DIR}:${PATH}"

if [[ -x "${ROOT}/node_modules/.bin/gltf-transform" ]]; then
  exec "${ROOT}/node_modules/.bin/gltf-transform" "$@"
fi
exec npx --yes "@gltf-transform/cli@${VERSION}" "$@"
