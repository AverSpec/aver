#!/usr/bin/env bash
set -euo pipefail

# Close a backlog item (Linear Issue) by setting its state to "Done".
# Usage: backlog-close <identifier>
# Output: Closed issue URL

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

if [[ $# -lt 1 ]]; then
  echo "Error: issue identifier is required" >&2
  echo "Usage: backlog-close <identifier>" >&2
  exit 1
fi

identifier="$1"

# Get the issue
issue=$(get_issue_by_identifier "$identifier")
if [[ -z "$issue" || "$issue" == "null" ]]; then
  echo "Error: issue '$identifier' not found" >&2
  exit 1
fi

issue_id=$(echo "$issue" | jq -r '.id')
issue_url=$(echo "$issue" | jq -r '.url')

# Get the first "completed" type state for this team (works with custom state names)
done_state_id=$(get_state_id_by_type "completed")
if [[ -z "$done_state_id" ]]; then
  echo "Error: could not find a completed workflow state for team — check LINEAR_TEAM_ID" >&2
  exit 1
fi

# Update the issue state
_tmp=$(mktemp)
jq -n --arg id "$issue_id" --arg sid "$done_state_id" '{
  query: "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { identifier url state { name } } } }",
  variables: {id: $id, input: {stateId: $sid}}
}' > "$_tmp"
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

success=$(echo "$result" | jq -r '.data.issueUpdate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to close issue — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

echo "$issue_url"
