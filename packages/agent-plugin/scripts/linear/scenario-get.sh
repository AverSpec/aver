#!/usr/bin/env bash
set -euo pipefail

# Get full details of a single scenario issue.
# Usage: scenario-get <identifier>
# Output: Full issue JSON (number, title, body, labels, comments, url)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

if [[ $# -lt 1 ]]; then
  echo "Error: issue identifier is required" >&2
  echo "Usage: scenario-get <identifier>" >&2
  exit 1
fi

identifier="$1"

issue=$(get_issue_by_identifier "$identifier")

if [[ -z "$issue" || "$issue" == "null" ]]; then
  echo "Error: issue '$identifier' not found" >&2
  exit 1
fi

echo "$issue" | jq '{
  number: .identifier,
  title,
  body: .description,
  labels: [.labels.nodes[].name],
  comments: [.comments.nodes[] | {id, body, createdAt, user: .user.name}],
  url
}'
