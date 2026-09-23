#!/usr/bin/env bash
# Create at most one date tag (YYYY-MM-DD) for Asia/Jakarta calendar day when
# main had meaningful commits that day.
#
# Flow:
#   1) Create + push the tag on tip of origin/main
#   2) Explicitly workflow_dispatch the Release workflow
#
# Tag pushes (even with a PAT) often do NOT cascade to on: push tags workflows.
# workflow_dispatch is the reliable trigger (GITHUB_TOKEN may use it).
#
# Env:
#   TAG_DATE            optional YYYY-MM-DD (default: today WIB)
#   FORCE               "true" to tag even with no meaningful commits
#   DRY_RUN             "true" to print actions without creating
#   RELEASE_BOT_TOKEN   optional PAT for tag push (else GH_TOKEN / GITHUB_TOKEN)
#   GH_TOKEN            used for `gh workflow run` (GITHUB_TOKEN is fine)
#   GITHUB_REPOSITORY   owner/name (set automatically on Actions)
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
REPO="${GITHUB_REPOSITORY:-RiffaAlfaridziPriatna/gump-desktop}"
PUSH_TOKEN="${RELEASE_BOT_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"
GH_API_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-${RELEASE_BOT_TOKEN:-}}}"

if [[ -z "$TAG_DATE" ]]; then
  TAG_DATE="$(TZ=Asia/Jakarta date +%Y-%m-%d)"
fi

if [[ ! "$TAG_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "✗ TAG_DATE must be YYYY-MM-DD, got: ${TAG_DATE}" >&2
  exit 1
fi

echo "▸ Daily release tag date (WIB): ${TAG_DATE}"

dispatch_release() {
  local tag="$1"
  require_cmd gh
  if [[ -z "$GH_API_TOKEN" ]]; then
    echo "✗ No token for gh workflow run (set GH_TOKEN / GITHUB_TOKEN)." >&2
    exit 1
  fi
  export GH_TOKEN="$GH_API_TOKEN"
  echo "▸ Dispatching Release workflow (workflow_dispatch) for tag ${tag}"
  # --ref must be the tag so github.sha is the tagged commit on main.
  gh workflow run release.yml \
    --repo "$REPO" \
    --ref "$tag" \
    -f "tag=${tag}"
  echo "▸ Dispatched. Check Actions → Release for tag ${tag}"
}

git fetch origin main --tags --force

tag_exists=false
if git rev-parse "refs/tags/${TAG_DATE}" >/dev/null 2>&1; then
  tag_exists=true
elif git ls-remote --tags origin "refs/tags/${TAG_DATE}" | grep -q .; then
  tag_exists=true
fi

if [[ "$tag_exists" == "true" ]]; then
  echo "▸ Tag ${TAG_DATE} already exists"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "▸ DRY_RUN=true — would dispatch Release for existing tag"
    exit 0
  fi
  # Recover when a prior tag push never cascaded into Release.
  dispatch_release "$TAG_DATE"
  exit 0
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

MAIN_SHA="$(git rev-parse origin/main)"
MAC_VERSION="$(tr -d '\n\r' < VERSION.macos 2>/dev/null || echo "?")"
WIN_VERSION="$(tr -d '\n\r' < VERSION.windows 2>/dev/null || echo "?")"

echo "▸ Will tag origin/main @ ${MAIN_SHA}"
echo "▸ Previous date tag: ${PREV_TAG:-"(none)"}"
echo "▸ Versions: macOS v${MAC_VERSION} / Windows v${WIN_VERSION}"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "▸ DRY_RUN=true — not creating/pushing tag or dispatching Release"
  if [[ -x "${ROOT_DIR}/scripts/generate-release-notes.sh" ]]; then
    echo "▸ Notes preview (Release workflow will author the GitHub Release):"
    bash "${ROOT_DIR}/scripts/generate-release-notes.sh" "${PREV_TAG}" "origin/main" | sed -n '1,40p'
  fi
  exit 0
fi

if [[ -z "$PUSH_TOKEN" ]]; then
  echo "✗ No token to push tag. Set RELEASE_BOT_TOKEN or GH_TOKEN." >&2
  exit 1
fi

git tag "$TAG_DATE" "$MAIN_SHA"
git push "https://x-access-token:${PUSH_TOKEN}@github.com/${REPO}.git" "refs/tags/${TAG_DATE}"

echo "▸ Pushed tag ${TAG_DATE} → ${REPO}"
dispatch_release "$TAG_DATE"
