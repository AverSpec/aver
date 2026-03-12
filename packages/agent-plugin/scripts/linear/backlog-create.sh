#!/usr/bin/env bash
set -euo pipefail

# Create a backlog item as a Linear Issue.
# Usage: backlog-create --title "..." [--priority high] [--type feature] [--body "..."]
# Priority accepts: urgent, high, medium, low, none, or P0-P3 shorthand.
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
      echo "Usage: backlog-create --title \"...\" [--priority high] [--type feature] [--body \"...\"]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$title" ]]; then
  echo "Error: --title is required" >&2
  echo "Usage: backlog-create --title \"...\" [--priority high] [--type feature] [--body \"...\"]" >&2
  exit 1
fi

# Resolve native priority value
priority_int=""
if [[ -n "$priority" ]]; then
  priority_int=$(resolve_priority "$priority")
  if [[ -z "$priority_int" ]]; then
    echo "Error: invalid priority '$priority'. Use: urgent, high, medium, low, none, or P0-P3." >&2
    exit 1
  fi
fi

# Build label list (type labels only — priority uses native field)
labels="backlog"
[[ -n "$type" ]] && labels="$labels,$type"

# Resolve label IDs
label_ids=$(resolve_label_ids "$labels")

# Build request body and execute
_tmp=$(mktemp)
if [[ -n "$priority_int" ]]; then
  jq -n \
    --arg title "$title" \
    --arg body "$body" \
    --arg teamId "$LINEAR_TEAM_ID" \
    --argjson labelIds "$label_ids" \
    --argjson priority "$priority_int" '{
    query: "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
    variables: {input: {title: $title, description: $body, teamId: $teamId, labelIds: $labelIds, priority: $priority}}
  }' > "$_tmp"
else
  jq -n \
    --arg title "$title" \
    --arg body "$body" \
    --arg teamId "$LINEAR_TEAM_ID" \
    --argjson labelIds "$label_ids" '{
    query: "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
    variables: {input: {title: $title, description: $body, teamId: $teamId, labelIds: $labelIds}}
  }' > "$_tmp"
fi
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

success=$(echo "$result" | jq -r '.data.issueCreate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to create issue — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

echo "$result" | jq '{number: .data.issueCreate.issue.identifier, url: .data.issueCreate.issue.url}'
