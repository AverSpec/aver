#!/usr/bin/env bash
set -euo pipefail

# Create a backlog item as a Linear Issue.
# Usage: backlog-create --title "..." [--priority P1] [--type feature] [--body "..."]
# Output: JSON { number, url }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

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

# Build label list
labels="backlog"
[[ -n "$priority" ]] && labels="$labels,$priority"
[[ -n "$type" ]]     && labels="$labels,$type"

# Resolve label IDs
label_ids=$(resolve_label_ids "$labels")

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
