#!/usr/bin/env bash
set -euo pipefail

# Update a backlog item (GitHub Issue).
# Usage: backlog-update <number> [--add-label ...] [--remove-label ...] [--body "..."] [--title "..."]
# Output: Updated issue URL

if [[ $# -lt 1 ]]; then
  echo "Error: issue number is required" >&2
  echo "Usage: backlog-update <number> [--add-label ...] [--remove-label ...] [--body \"...\"] [--title \"...\"]" >&2
  exit 1
fi

number="$1"
shift

add_labels=""
remove_labels=""
body=""
title=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --add-label)    add_labels="$2";    shift 2 ;;
    --remove-label) remove_labels="$2"; shift 2 ;;
    --body)         body="$2";          shift 2 ;;
    --title)        title="$2";         shift 2 ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: backlog-update <number> [--add-label ...] [--remove-label ...] [--body \"...\"] [--title \"...\"]" >&2
      exit 1
      ;;
  esac
done

args=("$number")
[[ -n "$add_labels" ]]    && args+=(--add-label "$add_labels")
[[ -n "$remove_labels" ]] && args+=(--remove-label "$remove_labels")
[[ -n "$body" ]]          && args+=(--body "$body")
[[ -n "$title" ]]         && args+=(--title "$title")

url=$(gh issue edit "${args[@]}")
echo "$url"
