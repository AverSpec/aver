#!/usr/bin/env bash
set -euo pipefail

# Get full details of a single scenario issue.
# Usage: scenario-get <number>
# Output: Full issue JSON (number, title, body, labels, comments, url)

if [[ $# -lt 1 ]]; then
  echo "Error: issue number is required" >&2
  echo "Usage: scenario-get <number>" >&2
  exit 1
fi

number="$1"

gh issue view "$number" --json number,title,body,labels,comments,url
