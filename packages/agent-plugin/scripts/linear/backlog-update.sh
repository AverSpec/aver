#!/usr/bin/env bash
set -euo pipefail

# Update a backlog item (Linear Issue).
# Usage: backlog-update <identifier> [--priority high] [--add-label ...] [--remove-label ...] [--body "..."] [--title "..."]
# Priority accepts: urgent, high, medium, low, none, or P0-P3 shorthand.
# Output: Updated issue URL

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

if [[ $# -lt 1 ]]; then
  echo "Error: issue identifier is required" >&2
  echo "Usage: backlog-update <identifier> [--priority high] [--add-label ...] [--remove-label ...] [--body \"...\"] [--title \"...\"]" >&2
  exit 1
fi

identifier="$1"
shift

add_labels=""
remove_labels=""
body=""
title=""
priority=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --add-label)    add_labels="$2";    shift 2 ;;
    --remove-label) remove_labels="$2"; shift 2 ;;
    --body)         body="$2";          shift 2 ;;
    --title)        title="$2";         shift 2 ;;
    --priority)     priority="$2";      shift 2 ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: backlog-update <identifier> [--priority high] [--add-label ...] [--remove-label ...] [--body \"...\"] [--title \"...\"]" >&2
      exit 1
      ;;
  esac
done

# Get the issue
issue=$(get_issue_by_identifier "$identifier")
if [[ -z "$issue" || "$issue" == "null" ]]; then
  echo "Error: issue '$identifier' not found" >&2
  exit 1
fi

issue_id=$(echo "$issue" | jq -r '.id')
issue_url=$(echo "$issue" | jq -r '.url')

# Build the update input
input="{}"

# Handle title update
if [[ -n "$title" ]]; then
  input=$(echo "$input" | jq --arg t "$title" '. + {title: $t}')
fi

# Handle body/description update
if [[ -n "$body" ]]; then
  input=$(echo "$input" | jq --arg b "$body" '. + {description: $b}')
fi

# Handle native priority update
if [[ -n "$priority" ]]; then
  priority_int=$(resolve_priority "$priority")
  if [[ -z "$priority_int" ]]; then
    echo "Error: invalid priority '$priority'. Use: urgent, high, medium, low, none, or P0-P3." >&2
    exit 1
  fi
  input=$(echo "$input" | jq --argjson p "$priority_int" '. + {priority: $p}')
fi

# Handle label changes
if [[ -n "$add_labels" || -n "$remove_labels" ]]; then
  # Start with current label IDs
  current_label_ids=$(echo "$issue" | jq '[.labels.nodes[].id]')

  # Remove labels
  if [[ -n "$remove_labels" ]]; then
    IFS=',' read -ra remove_arr <<< "$remove_labels"
    for label_name in "${remove_arr[@]}"; do
      label_name=$(echo "$label_name" | xargs)
      label_id=$(resolve_label_id "$label_name")
      if [[ -n "$label_id" ]]; then
        current_label_ids=$(echo "$current_label_ids" | jq --arg id "$label_id" 'map(select(. != $id))')
      fi
    done
  fi

  # Add labels
  if [[ -n "$add_labels" ]]; then
    IFS=',' read -ra add_arr <<< "$add_labels"
    for label_name in "${add_arr[@]}"; do
      label_name=$(echo "$label_name" | xargs)
      label_id=$(resolve_label_id "$label_name")
      if [[ -n "$label_id" ]]; then
        current_label_ids=$(echo "$current_label_ids" | jq --arg id "$label_id" 'if index($id) then . else . + [$id] end')
      fi
    done
  fi

  input=$(echo "$input" | jq --argjson ids "$current_label_ids" '. + {labelIds: $ids}')
fi

# Execute the update
_tmp=$(mktemp)
jq -n --arg id "$issue_id" --argjson inp "$input" '{
  query: "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { identifier url } } }",
  variables: {id: $id, input: $inp}
}' > "$_tmp"
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

success=$(echo "$result" | jq -r '.data.issueUpdate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to update issue — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

echo "$issue_url"
