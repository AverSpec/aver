#!/usr/bin/env bash
set -euo pipefail

# Add a question comment to a scenario issue.
# Usage: scenario-question <identifier> --body "..."
# Output: Comment URL (or ID if URL unavailable)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

if [[ $# -lt 1 ]]; then
  echo "Error: issue identifier is required" >&2
  echo "Usage: scenario-question <identifier> --body \"...\"" >&2
  exit 1
fi

identifier="$1"
shift
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --body) body="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-question <identifier> --body \"...\"" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$body" ]]; then
  echo "Error: --body is required" >&2
  echo "Usage: scenario-question <identifier> --body \"...\"" >&2
  exit 1
fi

# Get the issue
issue=$(get_issue_by_identifier "$identifier")
if [[ -z "$issue" || "$issue" == "null" ]]; then
  echo "Error: issue '$identifier' not found" >&2
  exit 1
fi

issue_id=$(echo "$issue" | jq -r '.id')

# Create the comment
comment_body=$(printf '❓ **Question**\n\n%s' "$body")
variables=$(jq -n --arg issueId "$issue_id" --arg body "$comment_body" \
  '{input: {issueId: $issueId, body: $body}}')

result=$(linear_query '
  mutation($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment { id body url }
    }
  }
' "$variables")

success=$(echo "$result" | jq -r '.data.commentCreate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to create comment — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

# Add has-question label
has_question_id=$(resolve_label_id "has-question")
if [[ -n "$has_question_id" ]]; then
  current_label_ids=$(echo "$issue" | jq '[.labels.nodes[].id]')
  # Add has-question if not already present
  updated_label_ids=$(echo "$current_label_ids" | jq --arg id "$has_question_id" 'if index($id) then . else . + [$id] end')

  linear_query '
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }
  ' "{\"id\": \"$issue_id\", \"input\": {\"labelIds\": $updated_label_ids}}" > /dev/null
fi

# Output the comment URL or ID
comment_url=$(echo "$result" | jq -r '.data.commentCreate.comment.url // empty')
if [[ -n "$comment_url" ]]; then
  echo "$comment_url"
else
  comment_id=$(echo "$result" | jq -r '.data.commentCreate.comment.id')
  echo "$comment_id"
fi
