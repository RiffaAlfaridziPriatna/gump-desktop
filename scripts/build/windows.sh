#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

VARIANT="${1:-exe}"

is_windows() {
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN* | Windows_NT) return 0 ;;
    *) return 1 ;;
  esac
}

WINDOWS_RELEASE_DIR="${ROOT_DIR}/windows/x64/Release/GumpDesktop"
WINDOWS_MSIX_DIR="${ROOT_DIR}/windows/AppPackages"

build_exe() {
  log "Building Windows release executable..."
  (
    cd "$ROOT_DIR"
    npx @react-native-community/cli run-windows --release --no-launch --logging
  )

  if [[ -f "${WINDOWS_RELEASE_DIR}/GumpDesktop.exe" ]]; then
    copy_artifact "${WINDOWS_RELEASE_DIR}/GumpDesktop.exe" "${DIST_DIR}/windows"
    return
  fi

  die "Windows executable not found at ${WINDOWS_RELEASE_DIR}/GumpDesktop.exe"
}

build_msix() {
  require_command msbuild

  log "Building Windows MSIX package..."
  (
    cd "$ROOT_DIR"
    msbuild windows/GumpDesktop.sln \
      /p:Configuration=Release \
      /p:Platform=x64 \
      /p:AppxBundle=Always \
      /p:UapAppxPackageBuildMode=StoreUpload
  )

  local latest_package
  latest_package="$(find "$WINDOWS_MSIX_DIR" -name '*.msix' -o -name '*.msixbundle' 2>/dev/null | sort | tail -n 1 || true)"

  if [[ -z "$latest_package" ]]; then
    die "MSIX package not found under ${WINDOWS_MSIX_DIR}"
  fi

  copy_artifact "$latest_package" "${DIST_DIR}/windows"
}

if ! is_windows; then
  die "Windows builds must run on Windows (or Git Bash on a Windows machine)."
fi

case "$VARIANT" in
  exe)
    build_exe
    ;;
  msix)
    build_msix
    ;;
  *)
    die "Unknown Windows variant: ${VARIANT}. Use: exe | msix"
    ;;
esac
