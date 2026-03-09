#!/usr/bin/env bash
set -euo pipefail

# Close a backlog item (GitHub Issue).
# Usage: backlog-close <number>
# Output: Closed issue URL

if [[ $# -lt 1 ]]; then
  echo "Error: issue number is required" >&2
  echo "Usage: backlog-close <number>" >&2
  exit 1
fi

number="$1"

gh issue close "$number"
gh issue view "$number" --json url -q .url
