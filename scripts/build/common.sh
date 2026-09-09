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

# Inlined into the JS bundle via babel-plugin-transform-inline-environment-variables.
# Unique per invocation so QA can tell whether they launched this binary.
ensure_app_build_identity() {
  if [[ -z "${GIT_SHA:-}" ]]; then
    GIT_SHA="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || true)"
    if [[ -z "$GIT_SHA" ]]; then
      GIT_SHA="unknown"
    fi
    export GIT_SHA
  fi
  if [[ -z "${APP_VERSION:-}" ]]; then
    export APP_VERSION="1.0"
  fi
  if [[ -z "${APP_BUILD_NUMBER:-}" ]]; then
    export APP_BUILD_NUMBER="$(date -u +%s)"
  fi
  if [[ -z "${APP_BUILD_ID:-}" ]]; then
    export APP_BUILD_ID="${GIT_SHA}-${APP_BUILD_NUMBER}"
  fi
  if [[ -z "${EXTRA_PACKAGER_ARGS:-}" ]]; then
    # Metro cache keys files, not env, so reset or the previous APP_BUILD_ID sticks.
    export EXTRA_PACKAGER_ARGS="--reset-cache"
  fi
  log "App identity: version=${APP_VERSION} build=${APP_BUILD_ID} git=${GIT_SHA}"
}

ensure_app_build_identity
