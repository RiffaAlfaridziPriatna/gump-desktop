#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

VARIANT="${1:-app}"

MACOS_WORKSPACE="${ROOT_DIR}/macos/GumpDesktop.xcworkspace"
MACOS_SCHEME="GumpDesktop-macOS"
DERIVED_DATA_PATH="${BUILD_DIR}/macos"
APP_PATH="${DERIVED_DATA_PATH}/Build/Products/Release/GumpDesktop.app"

require_command xcodebuild

if [[ ! -d "${ROOT_DIR}/macos/Pods" ]]; then
  die "macOS Pods not installed. Run: cd macos && pod install"
fi

build_app() {
  log "Building macOS release app..."
  ensure_dir "$DERIVED_DATA_PATH"

  xcodebuild \
    -workspace "$MACOS_WORKSPACE" \
    -scheme "$MACOS_SCHEME" \
    -configuration Release \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    build
}

package_zip() {
  local zip_path="${DIST_DIR}/macos/GumpDesktop-macOS.zip"

  ensure_dir "${DIST_DIR}/macos"
  rm -f "$zip_path"
  ditto -c -k --keepParent "$APP_PATH" "$zip_path"
  log "ZIP created at ${zip_path}"
}

build_app

case "$VARIANT" in
  app)
    copy_artifact "$APP_PATH" "${DIST_DIR}/macos"
    ;;
  zip)
    copy_artifact "$APP_PATH" "${DIST_DIR}/macos"
    package_zip
    ;;
  *)
    die "Unknown macOS variant: ${VARIANT}. Use: app | zip"
    ;;
esac
