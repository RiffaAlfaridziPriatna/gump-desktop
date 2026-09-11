#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=build/common.sh
source "${SCRIPT_DIR}/build/common.sh"

usage() {
  cat <<'EOF'
Generate release artifacts for GumpDesktop.

Usage:
  ./scripts/build.sh <platform> [variant] [env]

Platforms:
  macos     app (default) | zip | distribute
  windows   exe (default) | msix
  all       build macos app (host-dependent) — Windows must be built on Windows

Env (optional, default: prod, or GUMP_ENV):
  prod      loads .env           → APP_BUILD_ID=prod
  local     loads .env.local     → APP_BUILD_ID=local
  staging   loads .env.staging   → APP_BUILD_ID=staging

App version is per platform:
  macos   → VERSION.macos
  windows → VERSION.windows

Examples:
  npm run build:macos
  npm run build:macos:staging
  GUMP_ENV=local npm run build:macos
  npm run build:macos:zip
  npm run build:macos:distribute
  npm run build:windows

Environment:
  GUMP_ENV                       prod | local | staging (default: prod)
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
ENV_ARG="${3:-}"

if [[ -z "$PLATFORM" || "$PLATFORM" == "-h" || "$PLATFORM" == "--help" ]]; then
  usage
  exit 0
fi

# Third positional arg, or GUMP_ENV, otherwise prod.
if [[ -n "$ENV_ARG" ]]; then
  case "$ENV_ARG" in
    prod | local | staging) ;;
    *)
      die "Unknown env '${ENV_ARG}'. Use: prod | local | staging"
      ;;
  esac
  GUMP_ENV="$ENV_ARG"
fi
load_gump_env "${GUMP_ENV:-prod}"

ensure_dir "$DIST_DIR"

run_platform_build() {
  local platform="$1"
  local variant="${2:-}"

  case "$platform" in
    macos)
      ensure_app_build_identity macos
      bash "${SCRIPT_DIR}/build/macos.sh" "${variant:-app}"
      ;;
    windows)
      ensure_app_build_identity windows
      bash "${SCRIPT_DIR}/build/windows.sh" "${variant:-exe}"
      ;;
    *)
      die "Unknown platform: ${platform}. Use: macos | windows | all"
      ;;
  esac
}

case "$PLATFORM" in
  all)
    if [[ "$(uname -s)" == "Darwin" ]]; then
      run_platform_build macos app
    else
      log "Skipping macOS build (requires macOS host)."
    fi
    log "Windows builds must run on Windows: npm run build:windows"
    ;;
  macos | windows)
    run_platform_build "$PLATFORM" "$VARIANT"
    ;;
  android | ios)
    die "Android/iOS targets were removed. Use macos or windows."
    ;;
  *)
    usage
    die "Unknown platform: ${PLATFORM}"
    ;;
esac

log "Done. Output directory: ${GUMP_DIST_DIR:-${DIST_DIR}/${GUMP_ENV:-prod}/${PLATFORM}}/"
