#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=build/common.sh
source "${SCRIPT_DIR}/build/common.sh"

usage() {
  cat <<'EOF'
Generate release artifacts for GumpDesktop.

Usage:
  ./scripts/build.sh <platform> [variant]

Platforms:
  android   apk (default) | aab
  ios       ipa (default) | archive
  macos     app (default) | zip | distribute
  windows   exe (default) | msix
  all       build android apk + macos app (host-dependent)

Examples:
  npm run build:android
  npm run build:android:aab
  npm run build:ios
  npm run build:macos
  npm run build:macos:zip
  npm run build:macos:distribute
  npm run build:windows

Environment:
  IOS_EXPORT_METHOD              iOS export method (development | ad-hoc | app-store | enterprise)
  MACOS_CODESIGN_IDENTITY        Developer ID identity (distribute)
  APPLE_TEAM_ID                  Team ID (default: FWQ2YTUNN4)
  APPLE_ID                       Apple ID for notarytool (distribute)
  APPLE_APP_SPECIFIC_PASSWORD    App-specific password (distribute)
  APPLE_API_KEY_PATH             Alternative: AuthKey_XXX.p8 path
  APPLE_API_KEY_ID               Alternative: API key id
  APPLE_API_ISSUER_ID            Alternative: API issuer id
EOF
}

PLATFORM="${1:-}"
VARIANT="${2:-}"

if [[ -z "$PLATFORM" || "$PLATFORM" == "-h" || "$PLATFORM" == "--help" ]]; then
  usage
  exit 0
fi

ensure_dir "$DIST_DIR"

run_platform_build() {
  local platform="$1"
  local variant="${2:-}"

  case "$platform" in
    android)
      bash "${SCRIPT_DIR}/build/android.sh" "${variant:-apk}"
      ;;
    ios)
      bash "${SCRIPT_DIR}/build/ios.sh" "${variant:-ipa}"
      ;;
    macos)
      bash "${SCRIPT_DIR}/build/macos.sh" "${variant:-app}"
      ;;
    windows)
      bash "${SCRIPT_DIR}/build/windows.sh" "${variant:-exe}"
      ;;
    *)
      die "Unknown platform: ${platform}"
      ;;
  esac
}

case "$PLATFORM" in
  all)
    run_platform_build android apk
    if [[ "$(uname -s)" == "Darwin" ]]; then
      run_platform_build macos app
    else
      log "Skipping macOS build (requires macOS host)."
    fi
    ;;
  android | ios | macos | windows)
    run_platform_build "$PLATFORM" "$VARIANT"
    ;;
  *)
    usage
    die "Unknown platform: ${PLATFORM}"
    ;;
esac

log "Done. Output directory: ${DIST_DIR}/${PLATFORM}/"
