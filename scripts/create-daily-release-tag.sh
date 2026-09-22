#!/usr/bin/env bash
# Create at most one date tag (YYYY-MM-DD) for Asia/Jakarta calendar day when
# main had meaningful commits that day. Pushing/creating the tag triggers Release.
#
# Env:
#   TAG_DATE   optional YYYY-MM-DD (default: today WIB)
#   FORCE      "true" to tag even with no meaningful commits
#   DRY_RUN    "true" to print actions without creating
#   GH_TOKEN   required for gh release create / pr view
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "✗ Missing command: $1" >&2
    exit 1
  }
}

require_cmd git
require_cmd date

TAG_DATE="${TAG_DATE:-}"
FORCE="${FORCE:-false}"
DRY_RUN="${DRY_RUN:-false}"

if [[ -z "$TAG_DATE" ]]; then
  TAG_DATE="$(TZ=Asia/Jakarta date +%Y-%m-%d)"
fi

if [[ ! "$TAG_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "✗ TAG_DATE must be YYYY-MM-DD, got: ${TAG_DATE}" >&2
  exit 1
fi

echo "▸ Daily release tag date (WIB): ${TAG_DATE}"

git fetch origin main --tags --force

if git rev-parse "refs/tags/${TAG_DATE}" >/dev/null 2>&1; then
  echo "▸ Tag ${TAG_DATE} already exists — nothing to do"
  exit 0
fi

if [[ "$DRY_RUN" != "true" ]]; then
  require_cmd gh
fi

if command -v gh >/dev/null 2>&1 && [[ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
  if gh release view "$TAG_DATE" >/dev/null 2>&1; then
    echo "▸ GitHub Release ${TAG_DATE} already exists — nothing to do"
    exit 0
  fi
fi

# Window: [TAG_DATE 00:00, TAG_DATE 23:59:59] in Asia/Jakarta, as UTC for git
read -r SINCE_UTC UNTIL_UTC < <(
  python3 - "$TAG_DATE" <<'PY'
from datetime import datetime, timedelta, timezone
import sys
day = sys.argv[1]
wib = timezone(timedelta(hours=7))
start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=wib)
end = start + timedelta(days=1) - timedelta(seconds=1)
fmt = "%Y-%m-%dT%H:%M:%SZ"
print(start.astimezone(timezone.utc).strftime(fmt), end.astimezone(timezone.utc).strftime(fmt))
PY
)

echo "▸ Looking for meaningful commits on origin/main"
echo "  since ${SINCE_UTC} until ${UNTIL_UTC}"

meaningful=0
while IFS=$'\t' read -r subject author; do
  [[ -z "${subject:-}" ]] && continue
  if [[ "$subject" == chore:\ update\ appcast.xml\ for\ * ]]; then
    echo "  skip noise: ${subject}"
    continue
  fi
  echo "  + ${subject} (${author})"
  meaningful=$((meaningful + 1))
done < <(
  git log origin/main \
    --since="$SINCE_UTC" \
    --until="$UNTIL_UTC" \
    --pretty=format:'%s%x09%an' \
    --no-merges
)

# Also count PR merges that day (merge commits still signal product change)
while IFS= read -r subject; do
  [[ -z "$subject" ]] && continue
  if [[ "$subject" =~ ^Merge\ pull\ request\ # ]]; then
    echo "  + ${subject}"
    meaningful=$((meaningful + 1))
  fi
done < <(
  git log origin/main \
    --since="$SINCE_UTC" \
    --until="$UNTIL_UTC" \
    --pretty=format:'%s' \
    --merges
)

if [[ "$meaningful" -eq 0 && "$FORCE" != "true" ]]; then
  echo "▸ No meaningful main changes on ${TAG_DATE} — skip tag"
  exit 0
fi

PREV_TAG="$(
  git tag -l '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' \
    | sort \
    | awk -v d="$TAG_DATE" '$0 < d { print }' \
    | tail -n 1 || true
)"

echo "▸ Previous date tag: ${PREV_TAG:-"(none)"}"

NOTES_FILE="$(mktemp)"
trap 'rm -f "$NOTES_FILE"' EXIT

{
  MAC_VERSION="$(tr -d '\n\r' < VERSION.macos 2>/dev/null || echo "?")"
  WIN_VERSION="$(tr -d '\n\r' < VERSION.windows 2>/dev/null || echo "?")"
  echo "## Versions"
  echo ""
  echo "- **macOS**: v${MAC_VERSION}"
  echo "- **Windows**: v${WIN_VERSION}"
  echo ""
  bash "${ROOT_DIR}/scripts/generate-release-notes.sh" "${PREV_TAG}" "origin/main"
  echo ""
  echo "---"
  echo "*Daily tag for ${TAG_DATE} (Asia/Jakarta). Builds run via the Release workflow.*"
} >"$NOTES_FILE"

echo "▸ Notes preview:"
sed -n '1,80p' "$NOTES_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "▸ DRY_RUN=true — not creating tag/release"
  exit 0
fi

# Creates lightweight/annotated tag at main tip and a Release; triggers push:tags → Release workflow
gh release create "$TAG_DATE" \
  --target main \
  --title "Release ${TAG_DATE}" \
  --notes-file "$NOTES_FILE"

echo "▸ Created GitHub Release + tag ${TAG_DATE}"
