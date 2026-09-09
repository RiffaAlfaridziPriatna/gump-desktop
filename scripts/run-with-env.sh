#!/usr/bin/env bash
# Load a Gump env file and exec the remaining args.
# Usage: scripts/run-with-env.sh <prod|local|staging> <command...>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=build/common.sh
source "${SCRIPT_DIR}/build/common.sh"

ENV_NAME="${1:-}"
if [[ -z "$ENV_NAME" || "$ENV_NAME" == "-h" || "$ENV_NAME" == "--help" ]]; then
  cat <<'EOF'
Load Gump env vars then run a command.

Usage:
  scripts/run-with-env.sh <prod|local|staging> <command...>

Examples:
  scripts/run-with-env.sh local npx react-native run-macos
  scripts/run-with-env.sh staging npx react-native start
EOF
  exit 0
fi
shift

if [[ $# -eq 0 ]]; then
  die "Missing command after env name"
fi

load_gump_env "$ENV_NAME"
ensure_app_build_identity
exec "$@"
