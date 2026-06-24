#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"
BUILD_DIR="${ROOT_DIR}/build"

log() {
  printf '\n▸ %s\n' "$*"
}

die() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}

ensure_dir() {
  mkdir -p "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "Required command not found: $1"
  fi
}

copy_artifact() {
  local source_path="$1"
  local destination_dir="$2"

  if [[ ! -e "$source_path" ]]; then
    die "Build artifact not found: $source_path"
  fi

  ensure_dir "$destination_dir"
  cp -R "$source_path" "$destination_dir/"
  log "Artifact copied to ${destination_dir}/$(basename "$source_path")"
}
