#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

VARIANT="${1:-app}"

MACOS_WORKSPACE="${ROOT_DIR}/macos/GumpDesktop.xcworkspace"
MACOS_SCHEME="GumpDesktop-macOS"
DERIVED_DATA_PATH="${BUILD_DIR}/macos"
APP_NAME="GUMP - Cull Your Photos.app"
APP_PATH="${DERIVED_DATA_PATH}/Build/Products/Release/${APP_NAME}"
DIST_APP_PATH="${DIST_DIR}/macos/${APP_NAME}"
ENTITLEMENTS_PATH="${ROOT_DIR}/macos/GumpDesktop-macOS/GumpDesktop.entitlements"
DEFAULT_CODESIGN_IDENTITY="Developer ID Application: Gump Ai Limited (FWQ2YTUNN4)"
DEFAULT_TEAM_ID="FWQ2YTUNN4"

require_command xcodebuild

if [[ ! -d "${ROOT_DIR}/macos/Pods" ]]; then
  die "macOS Pods not installed. Run: cd macos && pod install"
fi

load_env_file() {
  local env_file="${ROOT_DIR}/.env"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    die "Missing required environment variable: ${name}"
  fi
}

build_app() {
  log "Building macOS release app..."
  ensure_dir "$DERIVED_DATA_PATH"

  xcodebuild \
    -workspace "$MACOS_WORKSPACE" \
    -scheme "$MACOS_SCHEME" \
    -configuration Release \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    DEVELOPMENT_TEAM="${APPLE_TEAM_ID:-$DEFAULT_TEAM_ID}" \
    CODE_SIGN_STYLE=Automatic \
    build
}

sync_dist_app() {
  ensure_dir "${DIST_DIR}/macos"
  rm -rf "$DIST_APP_PATH"
  cp -R "$APP_PATH" "$DIST_APP_PATH"
  log "Artifact ready at ${DIST_APP_PATH}"
}

package_zip() {
  local source_app="${1:-$DIST_APP_PATH}"
  local zip_path="${DIST_DIR}/macos/GumpDesktop-macOS.zip"

  if [[ ! -d "$source_app" ]]; then
    die "App not found for zip: ${source_app}"
  fi

  ensure_dir "${DIST_DIR}/macos"
  rm -f "$zip_path"
  ditto -c -k --keepParent --norsrc --noextattr "$source_app" "$zip_path"
  log "ZIP created at ${zip_path}"
}

sign_app() {
  local identity="${MACOS_CODESIGN_IDENTITY:-$DEFAULT_CODESIGN_IDENTITY}"

  require_command codesign

  if [[ ! -f "$ENTITLEMENTS_PATH" ]]; then
    die "Entitlements not found: ${ENTITLEMENTS_PATH}"
  fi

  if ! security find-identity -v -p codesigning | grep -Fq "$identity"; then
    die "Codesign identity not found in keychain: ${identity}"
  fi

  log "Signing with ${identity}..."
  codesign \
    --force \
    --deep \
    --options runtime \
    --timestamp \
    --entitlements "$ENTITLEMENTS_PATH" \
    --sign "$identity" \
    "$DIST_APP_PATH"

  codesign --verify --deep --strict --verbose=2 "$DIST_APP_PATH"
  log "Codesign OK"
}

notarize_and_staple() {
  local team_id="${APPLE_TEAM_ID:-$DEFAULT_TEAM_ID}"
  local notarize_zip="${BUILD_DIR}/macos/notarize-upload.zip"
  local submit_args=()

  require_command ditto
  require_command xcrun

  ensure_dir "$(dirname "$notarize_zip")"
  rm -f "$notarize_zip"
  ditto -c -k --keepParent "$DIST_APP_PATH" "$notarize_zip"

  if [[ -n "${APPLE_API_KEY_PATH:-}" || -n "${APPLE_API_KEY_ID:-}" || -n "${APPLE_API_ISSUER_ID:-}" ]]; then
    require_env APPLE_API_KEY_PATH
    require_env APPLE_API_KEY_ID
    require_env APPLE_API_ISSUER_ID
    submit_args=(
      --key "$APPLE_API_KEY_PATH"
      --key-id "$APPLE_API_KEY_ID"
      --issuer "$APPLE_API_ISSUER_ID"
    )
    log "Notarizing via App Store Connect API key..."
  else
    require_env APPLE_ID
    require_env APPLE_APP_SPECIFIC_PASSWORD
    submit_args=(
      --apple-id "$APPLE_ID"
      --team-id "$team_id"
      --password "$APPLE_APP_SPECIFIC_PASSWORD"
    )
    log "Notarizing via Apple ID..."
  fi

  xcrun notarytool submit "$notarize_zip" "${submit_args[@]}" --wait
  rm -f "$notarize_zip"

  log "Stapling notarization ticket..."
  xcrun stapler staple "$DIST_APP_PATH"
  xcrun stapler validate "$DIST_APP_PATH"
  log "Notarization + staple OK"
}

verify_distribution() {
  log "Verifying Gatekeeper assessment..."
  if spctl --assess --type execute --verbose=4 "$DIST_APP_PATH"; then
    log "spctl assessment accepted"
  else
    log "spctl assessment not accepted yet (sometimes delayed after staple). App is still stapled."
  fi
}

distribute_app() {
  load_env_file
  build_app
  sync_dist_app
  sign_app
  notarize_and_staple
  verify_distribution
  package_zip "$DIST_APP_PATH"
  log "Distribution bundle ready:"
  log "  App: ${DIST_APP_PATH}"
  log "  ZIP: ${DIST_DIR}/macos/GumpDesktop-macOS.zip"
}

case "$VARIANT" in
  app)
    build_app
    sync_dist_app
    ;;
  zip)
    build_app
    sync_dist_app
    package_zip "$DIST_APP_PATH"
    ;;
  distribute)
    distribute_app
    ;;
  *)
    die "Unknown macOS variant: ${VARIANT}. Use: app | zip | distribute"
    ;;
esac
