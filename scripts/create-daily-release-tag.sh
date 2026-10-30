#!/usr/bin/env bash
# Create at most one date tag (YYYY-MM-DD) for Asia/Jakarta calendar day when
# main had meaningful commits that day.
#
# Flow:
#   1) Create + push the tag on tip of origin/main with GITHUB_TOKEN
#      (GITHUB_TOKEN tag pushes do NOT cascade — intentional, avoids double runs)
#   2) Explicitly workflow_dispatch the Release workflow (reliable single trigger)
#
# Do NOT push the tag with a PAT: a PAT push can fire on: push tags AND our
# dispatch, which starts Release twice.
#
# Env:
#   TAG_DATE            optional YYYY-MM-DD (default: see resolve_default_tag_date)
#   FORCE               "true" to tag even with no meaningful commits
#   DRY_RUN             "true" to print actions without creating
#   GH_TOKEN            tag push + gh workflow run (GITHUB_TOKEN is fine)
#   GITHUB_REPOSITORY   owner/name (set automatically on Actions)
#   GITHUB_EVENT_NAME   schedule | workflow_dispatch | ... (set on Actions)
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
require_cmd python3

TAG_DATE="${TAG_DATE:-}"
FORCE="${FORCE:-false}"
DRY_RUN="${DRY_RUN:-false}"
EVENT_NAME="${GITHUB_EVENT_NAME:-}"
REPO="${GITHUB_REPOSITORY:-RiffaAlfaridziPriatna/gump-desktop}"
# Prefer GITHUB_TOKEN / GH_TOKEN only — never RELEASE_BOT_TOKEN for tag push.
PUSH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
GH_API_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"

# Default tag day for schedule closes the most recent WIB day whose 23:59 has
# passed. GitHub cron often runs hours late past midnight WIB; using wall-clock
# "today" then looks at the empty next day and skips (missed 2026-10-14).
resolve_default_tag_date() {
  python3 - "$EVENT_NAME" <<'PY'
from datetime import datetime, timedelta, timezone
import sys

event = sys.argv[1]
wib = timezone(timedelta(hours=7))
now = datetime.now(wib)

if event == "schedule":
    # Cron targets 23:59 WIB. If we are still before that clock time, the
    # intended closeout day is yesterday (delayed run after midnight).
    closeout = now.replace(hour=23, minute=59, second=0, microsecond=0)
    day = now.date() if now >= closeout else (now - timedelta(days=1)).date()
else:
    day = now.date()

print(day.isoformat())
PY
}

previous_wib_day() {
  python3 - "$1" <<'PY'
from datetime import datetime, timedelta
import sys
day = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
print((day - timedelta(days=1)).isoformat())
PY
}

wib_window_utc() {
  python3 - "$1" <<'PY'
from datetime import datetime, timedelta, timezone
import sys
day = sys.argv[1]
wib = timezone(timedelta(hours=7))
start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=wib)
end = start + timedelta(days=1) - timedelta(seconds=1)
fmt = "%Y-%m-%dT%H:%M:%SZ"
print(start.astimezone(timezone.utc).strftime(fmt), end.astimezone(timezone.utc).strftime(fmt))
PY
}

# Sets MEANINGFUL_COUNT; prints matching commit lines to stdout.
count_meaningful_commits() {
  local since_utc="$1"
  local until_utc="$2"
  MEANINGFUL_COUNT=0

  while IFS=$'\t' read -r subject author; do
    [[ -z "${subject:-}" ]] && continue
    if [[ "$subject" == chore:\ update\ appcast.xml\ for\ * ]]; then
      echo "  skip noise: ${subject}"
      continue
    fi
    echo "  + ${subject} (${author})"
    MEANINGFUL_COUNT=$((MEANINGFUL_COUNT + 1))
  done < <(
    git log origin/main \
      --since="$since_utc" \
      --until="$until_utc" \
      --pretty=format:'%s%x09%an' \
      --no-merges
  )

  # Also count PR merges that day (merge commits still signal product change)
  while IFS= read -r subject; do
    [[ -z "$subject" ]] && continue
    if [[ "$subject" =~ ^Merge\ pull\ request\ # ]]; then
      echo "  + ${subject}"
      MEANINGFUL_COUNT=$((MEANINGFUL_COUNT + 1))
    fi
  done < <(
    git log origin/main \
      --since="$since_utc" \
      --until="$until_utc" \
      --pretty=format:'%s' \
      --merges
  )
}

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

tag_exists_locally_or_remote() {
  local tag="$1"
  if git rev-parse "refs/tags/${tag}" >/dev/null 2>&1; then
    return 0
  fi
  if git ls-remote --tags origin "refs/tags/${tag}" | grep -q .; then
    return 0
  fi
  return 1
}

if [[ -z "$TAG_DATE" ]]; then
  TAG_DATE="$(resolve_default_tag_date)"
  if [[ "$EVENT_NAME" == "schedule" ]]; then
    echo "▸ schedule event — default tag day is end-of-day closeout (WIB), not wall-clock today"
  fi
fi

if [[ ! "$TAG_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "✗ TAG_DATE must be YYYY-MM-DD, got: ${TAG_DATE}" >&2
  exit 1
fi

echo "▸ Daily release tag date (WIB): ${TAG_DATE}"

git fetch origin main --tags --force

if tag_exists_locally_or_remote "$TAG_DATE"; then
  echo "▸ Tag ${TAG_DATE} already exists"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "▸ DRY_RUN=true — would dispatch Release for existing tag"
    exit 0
  fi
  # Recover when a prior tag push never cascaded into Release.
  dispatch_release "$TAG_DATE"
  exit 0
fi

read -r SINCE_UTC UNTIL_UTC < <(wib_window_utc "$TAG_DATE")

echo "▸ Looking for meaningful commits on origin/main"
echo "  since ${SINCE_UTC} until ${UNTIL_UTC}"

count_meaningful_commits "$SINCE_UTC" "$UNTIL_UTC"

# Schedule safety net: if the closeout day is empty (extreme delay / empty day
# after rollover), try the previous WIB day once before skipping.
if [[ "$MEANINGFUL_COUNT" -eq 0 && "$FORCE" != "true" && "$EVENT_NAME" == "schedule" ]]; then
  FALLBACK_DATE="$(previous_wib_day "$TAG_DATE")"
  if ! tag_exists_locally_or_remote "$FALLBACK_DATE"; then
    echo "▸ No meaningful commits on ${TAG_DATE}; trying previous WIB day ${FALLBACK_DATE}"
    read -r SINCE_UTC UNTIL_UTC < <(wib_window_utc "$FALLBACK_DATE")
    echo "  since ${SINCE_UTC} until ${UNTIL_UTC}"
    count_meaningful_commits "$SINCE_UTC" "$UNTIL_UTC"
    if [[ "$MEANINGFUL_COUNT" -gt 0 ]]; then
      TAG_DATE="$FALLBACK_DATE"
      echo "▸ Using fallback tag date (WIB): ${TAG_DATE}"
    fi
  else
    echo "▸ Previous WIB day ${FALLBACK_DATE} already tagged — not falling back"
  fi
fi

if [[ "$MEANINGFUL_COUNT" -eq 0 && "$FORCE" != "true" ]]; then
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
  echo "✗ No token to push tag. Set GH_TOKEN / GITHUB_TOKEN." >&2
  exit 1
fi

git tag "$TAG_DATE" "$MAIN_SHA"
git push "https://x-access-token:${PUSH_TOKEN}@github.com/${REPO}.git" "refs/tags/${TAG_DATE}"

echo "▸ Pushed tag ${TAG_DATE} → ${REPO}"
dispatch_release "$TAG_DATE"
