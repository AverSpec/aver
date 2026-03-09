#!/usr/bin/env bash
set -euo pipefail

# Add a question comment to a scenario issue.
# Usage: scenario-question <number> --body "..."
# Output: Comment URL

if [[ $# -lt 1 ]]; then
  echo "Error: issue number is required" >&2
  echo "Usage: scenario-question <number> --body \"...\"" >&2
  exit 1
fi

number="$1"
shift
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --body) body="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-question <number> --body \"...\"" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$body" ]]; then
  echo "Error: --body is required" >&2
  echo "Usage: scenario-question <number> --body \"...\"" >&2
  exit 1
fi

comment_body=$(printf '❓ **Question**\n\n%s' "$body")
comment_url=$(gh issue comment "$number" --body "$comment_body")
gh issue edit "$number" --add-label "has-question" > /dev/null

echo "$comment_url"
