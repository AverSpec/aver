#!/usr/bin/env bash
set -euo pipefail

# Transition a backlog item to a workflow state.
# Usage: backlog-status <identifier> --state <todo|in-progress|done|cancelled|backlog|triage>
# Output: JSON { identifier, state, url }
#
# State mapping (Linear workflow state names):
#   triage      → "Triage"
#   backlog     → "Backlog"
#   todo        → "Todo"
#   in-progress → "In Progress"
#   done        → "Done"
#   cancelled   → "Canceled"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

if [[ $# -lt 1 ]]; then
  echo "Error: issue identifier is required" >&2
  echo "Usage: backlog-status <identifier> --state <todo|in-progress|done|cancelled|backlog|triage>" >&2
  exit 1
fi

identifier="$1"
shift

state=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --state) state="$2"; shift 2 ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: backlog-status <identifier> --state <todo|in-progress|done|cancelled|backlog|triage>" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$state" ]]; then
  echo "Error: --state is required" >&2
  echo "Valid states: triage, backlog, todo, in-progress, done, cancelled" >&2
  exit 1
fi

# Map friendly state names to Linear workflow state names
case "$state" in
  triage)      state_name="Triage" ;;
  backlog)     state_name="Backlog" ;;
  todo)        state_name="Todo" ;;
  in-progress) state_name="In Progress" ;;
  done)        state_name="Done" ;;
  cancelled)   state_name="Canceled" ;;
  *)
    echo "Error: invalid state '$state'" >&2
    echo "Valid states: triage, backlog, todo, in-progress, done, cancelled" >&2
    exit 1
    ;;
esac

# Get the issue
issue=$(get_issue_by_identifier "$identifier")
if [[ -z "$issue" || "$issue" == "null" ]]; then
  echo "Error: issue '$identifier' not found" >&2
  exit 1
fi

issue_id=$(echo "$issue" | jq -r '.id')

# Get the target workflow state by name (not type, since multiple states can share a type)
target_state_id=$(get_state_id "$state_name")
if [[ -z "$target_state_id" ]]; then
  echo "Error: could not find '$state_name' workflow state for team" >&2
  exit 1
fi

# Update the issue state
_tmp=$(mktemp)
jq -n --arg id "$issue_id" --arg sid "$target_state_id" '{
  query: "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { identifier url state { name type } } } }",
  variables: {id: $id, input: {stateId: $sid}}
}' > "$_tmp"
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

success=$(echo "$result" | jq -r '.data.issueUpdate.success')
if [[ "$success" != "true" ]]; then
  echo "Error: failed to update issue state — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
  exit 1
fi

echo "$result" | jq '{
  identifier: .data.issueUpdate.issue.identifier,
  state: .data.issueUpdate.issue.state.name,
  url: .data.issueUpdate.issue.url
}'
