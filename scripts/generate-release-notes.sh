#!/usr/bin/env bash
# Print markdown release notes for commits on REF since PREV_TAG (exclusive).
# Usage: generate-release-notes.sh <prev_tag_or_empty> [ref]
set -euo pipefail

PREV_TAG="${1:-}"
REF="${2:-origin/main}"

is_noise_subject() {
  case "$1" in
    'chore: update appcast.xml for '*) return 0 ;;
    *) return 1 ;;
  esac
}

has_prev=false
if [[ -n "$PREV_TAG" ]] && git rev-parse "$PREV_TAG" >/dev/null 2>&1; then
  has_prev=true
fi

echo "## Changes"
echo ""

if [[ "$has_prev" == true ]]; then
  echo "_Since \`${PREV_TAG}\`._"
  echo ""
  merge_log=(git log "${PREV_TAG}..${REF}" --pretty=format:'%s' --merges)
  commit_log=(git log "${PREV_TAG}..${REF}" --pretty=format:'%h%x09%s%x09%an' --no-merges)
else
  echo "_No previous date tag — showing recent commits (max 50)._"
  echo ""
  merge_log=(git log "${REF}" --pretty=format:'%s' --merges -n 30)
  commit_log=(git log "${REF}" --pretty=format:'%h%x09%s%x09%an' --no-merges -n 50)
fi

commit_lines=()
while IFS=$'\t' read -r hash subject author; do
  [[ -z "${hash:-}" ]] && continue
  if is_noise_subject "$subject"; then
    continue
  fi
  commit_lines+=("- \`${hash}\` ${subject} — *${author}*")
done < <("${commit_log[@]}")

if [[ ${#commit_lines[@]} -eq 0 ]]; then
  echo "_No non-merge commits in range._"
else
  printf '%s\n' "${commit_lines[@]}"
fi

echo ""
echo "## Merged pull requests"
echo ""

pr_lines=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  if [[ "$line" =~ Merge\ pull\ request\ \#([0-9]+)\ from\ ([^[:space:]]+) ]]; then
    num="${BASH_REMATCH[1]}"
    branch="${BASH_REMATCH[2]}"
    title=""
    if command -v gh >/dev/null 2>&1 && [[ -n "${GH_TOKEN:-${GITHUB_TOKEN:-}}" ]]; then
      title="$(gh pr view "$num" --json title --jq .title 2>/dev/null || true)"
    fi
    if [[ -n "$title" ]]; then
      pr_lines+=("- #${num} ${title} (\`${branch}\`)")
    else
      pr_lines+=("- #${num} (\`${branch}\`)")
    fi
  fi
done < <("${merge_log[@]}")

if [[ ${#pr_lines[@]} -eq 0 ]]; then
  echo "_No merge commits with PR references in range._"
else
  printf '%s\n' "${pr_lines[@]}" | awk '!seen[$0]++'
fi
