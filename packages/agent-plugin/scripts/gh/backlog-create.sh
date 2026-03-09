#!/usr/bin/env bash
set -euo pipefail

# Create a backlog item as a GitHub Issue.
# Usage: backlog-create --title "..." [--priority P1] [--type feature] [--body "..."]
# Output: JSON { number, url }

title=""
priority=""
type=""
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)    title="$2";    shift 2 ;;
    --priority) priority="$2"; shift 2 ;;
    --type)     type="$2";     shift 2 ;;
    --body)     body="$2";     shift 2 ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: backlog-create --title \"...\" [--priority P1] [--type feature] [--body \"...\"]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$title" ]]; then
  echo "Error: --title is required" >&2
  echo "Usage: backlog-create --title \"...\" [--priority P1] [--type feature] [--body \"...\"]" >&2
  exit 1
fi

labels="backlog"
[[ -n "$priority" ]] && labels="$labels,$priority"
[[ -n "$type" ]]     && labels="$labels,$type"

url=$(gh issue create --title "$title" --body "${body:-}" --label "$labels")
number=$(echo "$url" | grep -oE '[0-9]+$')

echo "{\"number\": $number, \"url\": \"$url\"}"
