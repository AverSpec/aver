#!/usr/bin/env bash
set -euo pipefail

# Create a new scenario as a GitHub Issue with scenario + stage:captured labels.
# Usage: scenario-capture --title "..." [--body "..."]
# Output: JSON { number, url }

title=""
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title) title="$2"; shift 2 ;;
    --body)  body="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-capture --title \"...\" [--body \"...\"]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$title" ]]; then
  echo "Error: --title is required" >&2
  echo "Usage: scenario-capture --title \"...\" [--body \"...\"]" >&2
  exit 1
fi

url=$(gh issue create --title "$title" --body "${body:-}" --label "scenario,stage:captured")
number=$(echo "$url" | grep -oE '[0-9]+$')

echo "{\"number\": $number, \"url\": \"$url\"}"
