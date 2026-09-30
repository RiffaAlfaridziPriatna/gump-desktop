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
ENTITLEMENTS_PATH="${ROOT_DIR}/macos/GumpDesktop-macOS/GumpDesktop.entitlements"
DEFAULT_CODESIGN_IDENTITY="Developer ID Application: Gump Ai Limited (FWQ2YTUNN4)"
DEFAULT_TEAM_ID="FWQ2YTUNN4"
XCODEBUILD_LOG="${DERIVED_DATA_PATH}/xcodebuild.log"

# distribute / distribute-* → unsigned xcodebuild, then Developer ID later
IS_DISTRIBUTE=false
case "$VARIANT" in
  distribute | distribute-*) IS_DISTRIBUTE=true ;;
esac

require_command xcodebuild

# Catch missing Copy Bundle Resources before xcodebuild (build phases only).
case "$VARIANT" in
  app | zip | distribute | distribute-build)
    bash "${SCRIPT_DIR}/verify-macos-resources.sh"
    ;;
esac

if [[ ! -d "${ROOT_DIR}/macos/Pods" ]]; then
  case "$VARIANT" in
    distribute-sign | distribute-notarize | distribute-package)
      # Pods not required; app already built in a prior CI step.
      ;;
    *)
      die "macOS Pods not installed. Run: cd macos && pod install"
      ;;
  esac
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    die "Missing required environment variable: ${name}"
  fi
}

# Parent build.sh already called load_gump_env + ensure_app_build_identity.
# When this script is invoked directly, still load a default env.
if [[ -z "${GUMP_ENV:-}" || -z "${APP_BUILD_ID:-}" || -z "${APP_VERSION:-}" ]]; then
  load_gump_env "${GUMP_ENV:-prod}"
  ensure_app_build_identity macos
fi

DIST_OUT="${GUMP_DIST_DIR:?GUMP_DIST_DIR unset — call ensure_app_build_identity first}"
DIST_APP_PATH="${DIST_OUT}/${APP_NAME}"

print_xcodebuild_summary() {
  local log_file="$1"
  if [[ ! -f "$log_file" ]]; then
    return 0
  fi
  echo "::group::xcodebuild summary (errors / warnings / result)"
  # Keep the Actions UI readable: no full clang command lines.
  grep -E 'error: |warning: |\*\* BUILD |fatal error:|❌|✗' "$log_file" | tail -n 120 || true
  echo "::endgroup::"
  echo "▸ Full xcodebuild log: ${log_file}"
}

build_app() {
  log "Building macOS release app..."
  ensure_dir "$DERIVED_DATA_PATH"
  rm -f "$XCODEBUILD_LOG"

  local -a sign_args=()
  if [[ "$IS_DISTRIBUTE" == true ]]; then
    # CI only has Developer ID in the keychain. Skip Xcode automatic "Apple
    # Development" signing; sign_app() re-signs with Developer ID afterwards.
    sign_args=(
      CODE_SIGN_IDENTITY=""
      CODE_SIGNING_REQUIRED=NO
      CODE_SIGNING_ALLOWED=NO
    )
  else
    sign_args=(
      DEVELOPMENT_TEAM="${APPLE_TEAM_ID:-$DEFAULT_TEAM_ID}"
      CODE_SIGN_STYLE=Automatic
    )
  fi

  local status=0
  local heartbeat_pid=""

  # -quiet still prints errors to the log file; avoid megabytes of clang in Actions.
  # Heartbeat keeps the step visibly alive (quiet mode has almost no stdout).
  (
    local mins=0
    while sleep 60; do
      mins=$((mins + 1))
      printf '▸ xcodebuild still running… %sm\n' "$mins"
      if [[ -f "$XCODEBUILD_LOG" ]] && grep -qE 'error: |fatal error:' "$XCODEBUILD_LOG" 2>/dev/null; then
        echo "▸ errors seen so far (latest):"
        grep -E 'error: |fatal error:' "$XCODEBUILD_LOG" | tail -n 8 || true
      fi
    done
  ) &
  heartbeat_pid=$!

  set +e
  xcodebuild \
    -workspace "$MACOS_WORKSPACE" \
    -scheme "$MACOS_SCHEME" \
    -configuration Release \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    -quiet \
    "${sign_args[@]}" \
    CURRENT_PROJECT_VERSION="${APP_VERSION}" \
    MARKETING_VERSION="${APP_VERSION}" \
    APP_VERSION="${APP_VERSION}" \
    APP_BUILD_ID="${APP_BUILD_ID}" \
    GIT_SHA="${GIT_SHA}" \
    EXTRA_PACKAGER_ARGS="${EXTRA_PACKAGER_ARGS}" \
    build >"$XCODEBUILD_LOG" 2>&1
  status=$?
  set -e

  kill "$heartbeat_pid" 2>/dev/null || true
  wait "$heartbeat_pid" 2>/dev/null || true

  print_xcodebuild_summary "$XCODEBUILD_LOG"
  if [[ "$status" -ne 0 ]]; then
    echo "::error::xcodebuild failed (exit ${status}). Tail of log:"
    tail -n 80 "$XCODEBUILD_LOG" || true
    die "xcodebuild failed — see ${XCODEBUILD_LOG}"
  fi
  log "xcodebuild OK"
}

sync_dist_app() {
  ensure_dir "$DIST_OUT"
  rm -rf "$DIST_APP_PATH"
  cp -R "$APP_PATH" "$DIST_APP_PATH"
  printf '%s\n' "${APP_BUILD_ID}@${GIT_SHA} (v${APP_VERSION})" >"${DIST_OUT}/BUILD_ID.txt"
  log "Artifact ready at ${DIST_APP_PATH}"
  log "QA PostHog: appBuildId=${APP_BUILD_ID} gitSha=${GIT_SHA} appVersion=${APP_VERSION}"
}

package_zip() {
  local source_app="${1:-$DIST_APP_PATH}"
  local zip_path="${DIST_OUT}/Gump-MacOS-v${APP_VERSION}.zip"

  if [[ ! -d "$source_app" ]]; then
    die "App not found for zip: ${source_app}"
  fi

  ensure_dir "$DIST_OUT"
  rm -f "$zip_path"
  ditto -c -k --keepParent --norsrc --noextattr "$source_app" "$zip_path"
  log "ZIP created at ${zip_path}"
}

sign_sparkle_zip() {
  local zip_path="${DIST_OUT}/Gump-MacOS-v${APP_VERSION}.zip"
  local signature_path="${DIST_OUT}/sparkle_signature.txt"
  local sparkle_key_file=""
  local sign_update_bin=""
  local signature=""

  if [[ ! -f "$zip_path" ]]; then
    die "ZIP not found for Sparkle signing: ${zip_path}"
  fi

  if [[ -z "${SPARKLE_PRIVATE_KEY:-}" ]]; then
    log "SPARKLE_PRIVATE_KEY unset — skipping Sparkle EdDSA signature"
    return 0
  fi

  if command -v sign_update >/dev/null 2>&1; then
    sign_update_bin="$(command -v sign_update)"
  elif [[ -x "${ROOT_DIR}/tools/sparkle/bin/sign_update" ]]; then
    sign_update_bin="${ROOT_DIR}/tools/sparkle/bin/sign_update"
  elif [[ -x "${SPARKLE_BIN_DIR:-}/sign_update" ]]; then
    sign_update_bin="${SPARKLE_BIN_DIR}/sign_update"
  else
    die "sign_update not found. Install Sparkle tools or set SPARKLE_BIN_DIR."
  fi

  sparkle_key_file="$(mktemp)"
  printf '%s\n' "$SPARKLE_PRIVATE_KEY" >"$sparkle_key_file"
  # shellcheck disable=SC2064
  trap 'rm -f "$sparkle_key_file"' RETURN

  signature="$("$sign_update_bin" --ed-key-file "$sparkle_key_file" "$zip_path" | tr -d '\n')"
  if [[ -z "$signature" ]]; then
    die "Sparkle sign_update returned empty signature"
  fi

  printf '%s\n' "$signature" >"$signature_path"
  log "Sparkle signature written to ${signature_path}"
}

sign_app() {
  local identity="${MACOS_CODESIGN_IDENTITY:-$DEFAULT_CODESIGN_IDENTITY}"
  local list_file=""
  local total=0
  local idx=0
  local rel=""

  require_command codesign
  require_command file

  if [[ ! -d "$DIST_APP_PATH" ]]; then
    die "App not found for signing: ${DIST_APP_PATH}"
  fi

  if [[ ! -f "$ENTITLEMENTS_PATH" ]]; then
    die "Entitlements not found: ${ENTITLEMENTS_PATH}"
  fi

  # CI keychains can re-lock; unlock if MACOS_KEYCHAIN is set (Release workflow).
  if [[ -n "${MACOS_KEYCHAIN:-}" ]]; then
    security unlock-keychain -p "${MACOS_KEYCHAIN_PASSWORD:-}" "$MACOS_KEYCHAIN" || true
    security set-keychain-settings -lut 21600 "$MACOS_KEYCHAIN" || true
  fi

  if ! security find-identity -v -p codesigning | grep -Fq "$identity"; then
    die "Codesign identity not found in keychain: ${identity}"
  fi

  # Avoid `codesign --deep`: on CI it often looks hung for ~1h because it
  # silently walks every nested Mach-O and hits Apple's timestamp server
  # per object, sometimes also blocking on keychain UI that can't appear.
  # Apple recommends signing inside-out explicitly (TN2206).
  log "Signing with ${identity} (inside-out, no --deep)..."

  list_file="$(mktemp)"
  # shellcheck disable=SC2064
  trap 'rm -f "'"$list_file"'"' RETURN

  # Collect Mach-O files under the .app (exclude the bundle path itself).
  # Sort deepest paths first so frameworks/helpers are sealed before parents.
  while IFS= read -r -d '' candidate; do
    if file -b "$candidate" 2>/dev/null | grep -q 'Mach-O'; then
      printf '%s\n' "$candidate"
    fi
  done < <(find "$DIST_APP_PATH" -type f -print0) \
    | awk '{
        n = split($0, a, "/")
        printf "%04d\t%s\n", n, $0
      }' \
    | sort -rn \
    | cut -f2- >"$list_file"

  total="$(wc -l <"$list_file" | tr -d ' ')"
  log "Found ${total} Mach-O object(s) to sign"

  idx=0
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    # Nested code: hardened runtime + timestamp, no app entitlements.
    idx=$((idx + 1))
    rel="${target#"${DIST_APP_PATH}/"}"
    printf '▸ [%s/%s] codesign %s\n' "$idx" "$total" "$rel"
    codesign \
      --force \
      --options runtime \
      --timestamp \
      --sign "$identity" \
      "$target"
  done <"$list_file"

  # Seal nested bundles after their Mach-O contents (deepest first).
  list_file_bundles="$(mktemp)"
  find "$DIST_APP_PATH" \
    \( -name '*.framework' -o -name '*.appex' -o -name '*.xpc' -o -name '*.bundle' \) \
    -print \
    | awk '{
        n = split($0, a, "/")
        printf "%04d\t%s\n", n, $0
      }' \
    | sort -rn \
    | cut -f2- >"$list_file_bundles"

  total_bundles="$(wc -l <"$list_file_bundles" | tr -d ' ')"
  if [[ "$total_bundles" -gt 0 ]]; then
    log "Sealing ${total_bundles} nested bundle(s)..."
    idx=0
    while IFS= read -r target; do
      [[ -z "$target" ]] && continue
      idx=$((idx + 1))
      rel="${target#"${DIST_APP_PATH}/"}"
      printf '▸ bundle [%s/%s] codesign %s\n' "$idx" "$total_bundles" "$rel"
      codesign \
        --force \
        --options runtime \
        --timestamp \
        --sign "$identity" \
        "$target"
    done <"$list_file_bundles"
  fi
  rm -f "$list_file_bundles"

  log "Sealing outer .app bundle..."
  # Expand any leftover Xcode-style vars — codesign embeds entitlements verbatim.
  local bundle_id
  local entitlements_for_sign
  bundle_id="$(
    /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' \
      "${DIST_APP_PATH}/Contents/Info.plist" 2>/dev/null || true
  )"
  if [[ -z "$bundle_id" ]]; then
    die "Could not read CFBundleIdentifier from ${DIST_APP_PATH}"
  fi
  entitlements_for_sign="$(mktemp "${TMPDIR:-/tmp}/gump-entitlements.XXXXXX.plist")"
  # shellcheck disable=SC2064
  trap 'rm -f "'"$list_file"'" "'"$entitlements_for_sign"'"' RETURN
  sed "s/\$(PRODUCT_BUNDLE_IDENTIFIER)/${bundle_id}/g" \
    "$ENTITLEMENTS_PATH" >"$entitlements_for_sign"
  if grep -q '\$(' "$entitlements_for_sign"; then
    die "Entitlements still contain unexpanded \$() after substitution: ${entitlements_for_sign}"
  fi
  if ! grep -q "${bundle_id}-spks" "$entitlements_for_sign" ||
     ! grep -q "${bundle_id}-spki" "$entitlements_for_sign"; then
    die "Sparkle sandbox mach-lookup entries missing for ${bundle_id}-spks/-spki"
  fi

  codesign \
    --force \
    --options runtime \
    --timestamp \
    --entitlements "$entitlements_for_sign" \
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

  log "Notarizing submission started (notarytool --wait)..."
  # Progress lines from Apple; avoid dumping unrelated noise.
  xcrun notarytool submit "$notarize_zip" "${submit_args[@]}" --wait --timeout 45m
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
  build_app
  sync_dist_app
  sign_app
  notarize_and_staple
  verify_distribution
  package_zip "$DIST_APP_PATH"
  sign_sparkle_zip
  log "Distribution bundle ready:"
  log "  App: ${DIST_APP_PATH}"
  log "  ZIP: ${DIST_OUT}/Gump-MacOS-v${APP_VERSION}.zip"
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
  # CI-split phases (same runner; keeps Actions step list readable)
  distribute-build)
    build_app
    sync_dist_app
    ;;
  distribute-sign)
    sign_app
    ;;
  distribute-notarize)
    notarize_and_staple
    verify_distribution
    ;;
  distribute-package)
    package_zip "$DIST_APP_PATH"
    sign_sparkle_zip
    log "Distribution bundle ready:"
    log "  App: ${DIST_APP_PATH}"
    log "  ZIP: ${DIST_OUT}/Gump-MacOS-v${APP_VERSION}.zip"
    ;;
  *)
    die "Unknown macOS variant: ${VARIANT}. Use: app | zip | distribute | distribute-build | distribute-sign | distribute-notarize | distribute-package"
    ;;
esac
