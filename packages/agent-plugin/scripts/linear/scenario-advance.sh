#!/usr/bin/env bash
set -euo pipefail

# Advance a scenario to a new pipeline stage.
# Removes the old stage:* label and adds the new one.
# Usage: scenario-advance <identifier> --to <stage>
# Output: JSON { number, url, stage }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

valid_stages=("captured" "characterized" "mapped" "specified" "implemented")

if [[ $# -lt 1 ]]; then
  echo "Error: issue identifier is required" >&2
  echo "Usage: scenario-advance <identifier> --to <stage>" >&2
  exit 1
fi

identifier="$1"
shift
to=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) to="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-advance <identifier> --to <stage>" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$to" ]]; then
  echo "Error: --to is required" >&2
  echo "Usage: scenario-advance <identifier> --to <stage>" >&2
  exit 1
fi

# Validate stage
valid=false
for s in "${valid_stages[@]}"; do
  if [[ "$s" == "$to" ]]; then
    valid=true
    break
  fi
done

if [[ "$valid" != "true" ]]; then
  echo "Error: invalid stage '$to'. Must be one of: ${valid_stages[*]}" >&2
  exit 1
fi

# Get the issue and its current labels
issue=$(get_issue_by_identifier "$identifier")
if [[ -z "$issue" || "$issue" == "null" ]]; then
  echo "Error: issue '$identifier' not found" >&2
  exit 1
fi

issue_id=$(echo "$issue" | jq -r '.id')
issue_url=$(echo "$issue" | jq -r '.url')

# Get current label IDs, filtering out old stage:* labels
current_label_ids=$(echo "$issue" | jq '[.labels.nodes[] | select(.name | startswith("stage:") | not) | .id]')

# Resolve the new stage label ID
new_stage_id=$(resolve_label_id "stage:$to")
if [[ -z "$new_stage_id" ]]; then
  echo "Error: label 'stage:$to' not found — run setup-labels.sh first" >&2
  exit 1
fi

# Merge: existing non-stage labels + new stage label
updated_label_ids=$(echo "$current_label_ids" | jq --arg id "$new_stage_id" '. + [$id]')

# Update the issue
_tmp=$(mktemp)
jq -n --arg id "$issue_id" --argjson lids "$updated_label_ids" '{
  query: "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { identifier url } } }",
  variables: {id: $id, input: {labelIds: $lids}}
}' > "$_tmp"
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

success=$(echo "$result" | jq -r '.data.issueUpdate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to update issue — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

echo "{\"number\": \"$identifier\", \"url\": \"$issue_url\", \"stage\": \"$to\"}"
