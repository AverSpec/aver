#!/usr/bin/env bash
set -euo pipefail

# Resolve a question comment on a scenario issue.
# Replaces the comment with resolution and removes has-question if no questions remain.
# Usage: scenario-resolve <identifier> --comment-id <id> --body "..."
# Output: Updated comment ID

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

if [[ $# -lt 1 ]]; then
  echo "Error: issue identifier is required" >&2
  echo "Usage: scenario-resolve <identifier> --comment-id <id> --body \"...\"" >&2
  exit 1
fi

identifier="$1"
shift
comment_id=""
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --comment-id) comment_id="$2"; shift 2 ;;
    --body)       body="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-resolve <identifier> --comment-id <id> --body \"...\"" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$comment_id" ]]; then
  echo "Error: --comment-id is required" >&2
  exit 1
fi

if [[ -z "$body" ]]; then
  echo "Error: --body is required" >&2
  exit 1
fi

# Get the original comment
result=$(linear_query '
  query($id: String!) {
    comment(id: $id) {
      id body url
    }
  }
' "{\"id\": \"$comment_id\"}")

original_body=$(echo "$result" | jq -r '.data.comment.body // empty')
if [[ -z "$original_body" ]]; then
  echo "Error: comment '$comment_id' not found" >&2
  exit 1
fi

# Replace the question emoji with checkmark and append resolution
new_body=$(echo "$original_body" | sed 's/❓/✅/')
new_body=$(printf '%s\n\n---\n\n**Resolution:** %s' "$new_body" "$body")

# Update the comment
variables=$(jq -n --arg id "$comment_id" --arg body "$new_body" \
  '{id: $id, input: {body: $body}}')

update_result=$(linear_query '
  mutation($id: String!, $input: CommentUpdateInput!) {
    commentUpdate(id: $id, input: $input) {
      success
      comment { id url }
    }
  }
' "$variables")

success=$(echo "$update_result" | jq -r '.data.commentUpdate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to update comment — $(echo "$update_result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

# Check if any question comments remain on the issue
issue=$(get_issue_by_identifier "$identifier")
if [[ -z "$issue" || "$issue" == "null" ]]; then
  echo "Error: issue '$identifier' not found" >&2
  exit 1
fi

issue_id=$(echo "$issue" | jq -r '.id')
remaining=$(echo "$issue" | jq '[.comments.nodes[] | select(.body | startswith("❓"))] | length')

if [[ "$remaining" -eq 0 ]]; then
  # Remove has-question label
  has_question_id=$(resolve_label_id "has-question")
  if [[ -n "$has_question_id" ]]; then
    updated_label_ids=$(echo "$issue" | jq --arg id "$has_question_id" '[.labels.nodes[].id | select(. != $id)]')
    linear_query '
      mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) { success }
      }
    ' "{\"id\": \"$issue_id\", \"input\": {\"labelIds\": $updated_label_ids}}" > /dev/null
  fi
fi

# Output the updated comment URL or ID
updated_url=$(echo "$update_result" | jq -r '.data.commentUpdate.comment.url // empty')
if [[ -n "$updated_url" ]]; then
  echo "$updated_url"
else
  echo "$comment_id"
fi
