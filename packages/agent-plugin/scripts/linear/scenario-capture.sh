#!/usr/bin/env bash
set -euo pipefail

# Create a new scenario as a Linear Issue with scenario + stage:captured labels.
# Usage: scenario-capture --title "..." [--body "..."]
# Output: JSON { number, url }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

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

# Resolve label IDs
label_ids=$(resolve_label_ids "scenario,stage:captured")

# Build variables JSON
variables=$(jq -n \
  --arg title "$title" \
  --arg body "$body" \
  --arg teamId "$LINEAR_TEAM_ID" \
  --argjson labelIds "$label_ids" \
  '{input: {title: $title, description: $body, teamId: $teamId, labelIds: $labelIds}}')

result=$(linear_query '
  mutation($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }
' "$variables")

success=$(echo "$result" | jq -r '.data.issueCreate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to create issue — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

echo "$result" | jq '{number: .data.issueCreate.issue.identifier, url: .data.issueCreate.issue.url}'
