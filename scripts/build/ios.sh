#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

VARIANT="${1:-ipa}"
EXPORT_METHOD="${IOS_EXPORT_METHOD:-development}"

IOS_WORKSPACE="${ROOT_DIR}/ios/GumpDesktop.xcworkspace"
IOS_SCHEME="GumpDesktop"
ARCHIVE_PATH="${BUILD_DIR}/ios/GumpDesktop.xcarchive"
EXPORT_OPTIONS_PATH="${BUILD_DIR}/ios/ExportOptions.plist"

require_command xcodebuild

if [[ ! -d "${ROOT_DIR}/ios/Pods" ]]; then
  die "iOS Pods not installed. Run: cd ios && pod install"
fi

write_export_options() {
  ensure_dir "$(dirname "$EXPORT_OPTIONS_PATH")"
  cat >"$EXPORT_OPTIONS_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${EXPORT_METHOD}</string>
  <key>signingStyle</key>
  <string>automatic</string>
</dict>
</plist>
EOF
}

build_archive() {
  log "Archiving iOS app (Release)..."
  ensure_dir "$(dirname "$ARCHIVE_PATH")"

  xcodebuild \
    -workspace "$IOS_WORKSPACE" \
    -scheme "$IOS_SCHEME" \
    -configuration Release \
    -destination "generic/platform=iOS" \
    -archivePath "$ARCHIVE_PATH" \
    archive
}

export_ipa() {
  log "Exporting IPA (method: ${EXPORT_METHOD})..."
  write_export_options
  ensure_dir "${DIST_DIR}/ios"

  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "${DIST_DIR}/ios" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PATH"
}

case "$VARIANT" in
  archive)
    build_archive
    log "Archive created at ${ARCHIVE_PATH}"
    ;;
  ipa)
    build_archive
    export_ipa
    log "IPA exported to ${DIST_DIR}/ios/"
    ;;
  *)
    die "Unknown iOS variant: ${VARIANT}. Use: ipa | archive"
    ;;
esac
