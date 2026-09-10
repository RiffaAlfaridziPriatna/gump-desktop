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
    die "Build artifact not found: ${source_path}"
  fi

  ensure_dir "$destination_dir"
  cp -R "$source_path" "$destination_dir/"
  log "Artifact copied to ${destination_dir}/$(basename "$source_path")"
}

# Map GUMP_ENV → dotenv file. Values: prod | local | staging.
gump_env_file_for() {
  case "$1" in
    prod) echo "${ROOT_DIR}/.env" ;;
    local) echo "${ROOT_DIR}/.env.local" ;;
    staging) echo "${ROOT_DIR}/.env.staging" ;;
    *)
      die "Unknown GUMP_ENV '${1}'. Use: prod | local | staging"
      ;;
  esac
}

# Source the env file for the given environment and pin APP_BUILD_ID to it.
# Does not require the file to exist (falls back to identity defaults).
load_gump_env() {
  local env_name="${1:-${GUMP_ENV:-prod}}"
  local env_file
  env_file="$(gump_env_file_for "$env_name")"

  export GUMP_ENV="$env_name"
  # Force the PostHog / identity label from the selected environment.
  export APP_BUILD_ID="$env_name"

  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    # Env file must not override the selected environment label.
    export APP_BUILD_ID="$env_name"
    log "Loaded env ${env_name} from ${env_file}"
  else
    log "No env file at ${env_file}; continuing with defaults for ${env_name}"
  fi
}

# Platform marketing version lives in VERSION.macos / VERSION.windows.
version_file_for() {
  case "$1" in
    macos) echo "${ROOT_DIR}/VERSION.macos" ;;
    windows) echo "${ROOT_DIR}/VERSION.windows" ;;
    *)
      die "Unknown GUMP_PLATFORM '${1}'. Use: macos | windows"
      ;;
  esac
}

read_app_version() {
  local platform="${1:-${GUMP_PLATFORM:-macos}}"
  local version_file
  version_file="$(version_file_for "$platform")"
  if [[ -f "$version_file" ]]; then
    tr -d '[:space:]' <"$version_file"
  elif [[ "$platform" == "macos" ]]; then
    echo "1.0.0"
  else
    echo "0.0.0.1"
  fi
}

# Inlined into the JS bundle via babel-plugin-transform-inline-environment-variables.
# GIT_SHA from git. APP_VERSION from VERSION.<platform>. APP_BUILD_ID from GUMP_ENV.
ensure_app_build_identity() {
  local platform="${1:-${GUMP_PLATFORM:-macos}}"
  case "$platform" in
    macos | windows) ;;
    *)
      die "Unknown GUMP_PLATFORM '${platform}'. Use: macos | windows"
      ;;
  esac
  export GUMP_PLATFORM="$platform"

  export GIT_SHA
  GIT_SHA="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || true)"
  if [[ -z "$GIT_SHA" ]]; then
    GIT_SHA="unknown"
  fi

  export APP_VERSION
  APP_VERSION="$(read_app_version "$platform")"

  if [[ -z "${GUMP_ENV:-}" ]]; then
    export GUMP_ENV="prod"
  fi
  if [[ -z "${APP_BUILD_ID:-}" ]]; then
    export APP_BUILD_ID="$GUMP_ENV"
  fi

  if [[ -z "${APP_BUILD_NUMBER:-}" ]]; then
    export APP_BUILD_NUMBER="$(date -u +%s)"
  fi

  if [[ -z "${EXTRA_PACKAGER_ARGS:-}" ]]; then
    # Metro cache keys files, not env, so reset or the previous identity sticks.
    export EXTRA_PACKAGER_ARGS="--reset-cache"
  fi

  log "App identity: platform=${GUMP_PLATFORM} env=${GUMP_ENV} version=${APP_VERSION} buildId=${APP_BUILD_ID} git=${GIT_SHA}"
}
