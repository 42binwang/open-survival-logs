#!/usr/bin/env bash
# Installs the KTX-Software command-line tools (ktx, toktx, ktxinfo, ktx2check + libktx) into tools/bin/.
# KTX-Software has no Homebrew formula, so this unpacks the official, notarized GitHub release package
# without running its installer (nothing is written outside tools/bin/).
# macOS only (arm64 and x86_64 packages): the pipeline's pinned platform is the macOS build machine. On other
# platforms it prints the pinned release URL and exits 1.
#
#   tools/bin/install-ktx.sh           install if missing or a different version is present
#   tools/bin/install-ktx.sh --force   reinstall
#   tools/bin/install-ktx.sh --check   exit 0 if the pinned version is installed, 1 otherwise
set -euo pipefail

KTX_VERSION="4.4.2"
BASE_URL="https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VERSION}"
# SHA-256 digests as published on the GitHub release (and recorded in assets/sources.lock.json).
PKG_ARM64="KTX-Software-${KTX_VERSION}-Darwin-arm64.pkg"
SHA_ARM64="500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c"
PKG_X64="KTX-Software-${KTX_VERSION}-Darwin-x86_64.pkg"
SHA_X64="efecc685ab891a6e119a9fdc8cbe038e135f9a367eb2f5d8a059553f947f1fea"
SIGNER="Developer ID Installer: The Khronos Group, Inc. (TD2656HYNK)"

BIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="${BIN_DIR}/.cache"
TOOLS=(ktx toktx ktxinfo ktx2check)

installed_version() {
  [[ -x "${BIN_DIR}/ktx" ]] || return 1
  "${BIN_DIR}/ktx" --version 2>/dev/null | sed -n 's/^ktx version: v\{0,1\}\([0-9][0-9.]*\).*/\1/p'
}

mode="install"
case "${1:-}" in
  --force) mode="force" ;;
  --check) mode="check" ;;
  "") ;;
  *) echo "usage: $0 [--force|--check]" >&2; exit 2 ;;
esac

current="$(installed_version || true)"
if [[ "${mode}" == "check" ]]; then
  [[ "${current}" == "${KTX_VERSION}" ]] && { echo "ktx ${current} installed in tools/bin"; exit 0; }
  echo "ktx ${KTX_VERSION} not installed in tools/bin (found: ${current:-none})" >&2
  exit 1
fi
if [[ "${mode}" == "install" && "${current}" == "${KTX_VERSION}" ]]; then
  echo "ktx ${current} already installed in tools/bin"
  exit 0
fi

os="$(uname -s)"
arch="$(uname -m)"
if [[ "${os}" != "Darwin" ]]; then
  echo "install-ktx.sh unpacks the macOS release only. On ${os}, install KTX-Software ${KTX_VERSION} from" >&2
  echo "  ${BASE_URL}/ (e.g. KTX-Software-${KTX_VERSION}-Linux-x86_64.tar.bz2) and put ktx on PATH or in tools/bin/." >&2
  exit 1
fi
case "${arch}" in
  arm64) pkg="${PKG_ARM64}"; sha="${SHA_ARM64}" ;;
  x86_64) pkg="${PKG_X64}"; sha="${SHA_X64}" ;;
  *) echo "unsupported macOS architecture: ${arch}" >&2; exit 1 ;;
esac

mkdir -p "${CACHE_DIR}"
pkg_path="${CACHE_DIR}/${pkg}"
if [[ ! -f "${pkg_path}" ]] || [[ "$(shasum -a 256 "${pkg_path}" | cut -d' ' -f1)" != "${sha}" ]]; then
  echo "downloading ${pkg}"
  curl --fail --location --silent --show-error --retry 3 -o "${pkg_path}.part" "${BASE_URL}/${pkg}"
  mv "${pkg_path}.part" "${pkg_path}"
fi
actual="$(shasum -a 256 "${pkg_path}" | cut -d' ' -f1)"
if [[ "${actual}" != "${sha}" ]]; then
  echo "SHA-256 mismatch for ${pkg}: expected ${sha}, got ${actual}" >&2
  rm -f "${pkg_path}"
  exit 1
fi
if ! pkgutil --check-signature "${pkg_path}" | grep -qF "${SIGNER}"; then
  echo "package signature does not name '${SIGNER}'" >&2
  exit 1
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/ktx-install.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
pkgutil --expand-full "${pkg_path}" "${work}/pkg" >/dev/null
tools_payload="$(find "${work}/pkg" -maxdepth 1 -name '*-tools.pkg' -print -quit)/Payload/usr/local/bin"
lib_payload="$(find "${work}/pkg" -maxdepth 1 -name '*-library.pkg' -print -quit)/Payload/usr/local/lib"
dylib="$(find "${lib_payload}" -maxdepth 1 -type f -name 'libktx.*.dylib' -print -quit)"
[[ -n "${dylib}" ]] || { echo "libktx dylib not found in package" >&2; exit 1; }

for t in "${TOOLS[@]}"; do
  install -m 0755 "${tools_payload}/${t}" "${BIN_DIR}/${t}"
done
# The tools load @rpath/libktx.4.dylib and carry @executable_path in their rpath.
install -m 0644 "${dylib}" "${BIN_DIR}/libktx.4.dylib"

got="$(installed_version || true)"
if [[ "${got}" != "${KTX_VERSION}" ]]; then
  echo "installed ktx reports version '${got}', expected ${KTX_VERSION}" >&2
  exit 1
fi
echo "installed ktx ${got} (${pkg}) into tools/bin"
