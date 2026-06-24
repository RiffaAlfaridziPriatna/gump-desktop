#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

VARIANT="${1:-apk}"

build_apk() {
  log "Building Android release APK..."
  (
    cd "${ROOT_DIR}/android"
    ./gradlew assembleRelease --no-daemon
  )

  copy_artifact \
    "${ROOT_DIR}/android/app/build/outputs/apk/release/app-release.apk" \
    "${DIST_DIR}/android"
}

build_aab() {
  log "Building Android release App Bundle (AAB)..."
  (
    cd "${ROOT_DIR}/android"
    ./gradlew bundleRelease --no-daemon
  )

  copy_artifact \
    "${ROOT_DIR}/android/app/build/outputs/bundle/release/app-release.aab" \
    "${DIST_DIR}/android"
}

case "$VARIANT" in
  apk)
    build_apk
    ;;
  aab)
    build_aab
    ;;
  *)
    die "Unknown Android variant: ${VARIANT}. Use: apk | aab"
    ;;
esac
