#!/usr/bin/env bash
# Shared Linear API helper — sourced by all scripts, not executed directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINEAR_API="https://api.linear.app/graphql"

# Validate required environment variables.
require_env() {
  if [[ -z "${LINEAR_API_KEY:-}" ]]; then
    echo "Error: LINEAR_API_KEY environment variable is required" >&2
    exit 1
  fi
  if [[ -z "${LINEAR_TEAM_ID:-}" ]]; then
    echo "Error: LINEAR_TEAM_ID environment variable is required" >&2
    exit 1
  fi
}

# Execute a GraphQL query against the Linear API.
# Usage: linear_query '<graphql>' '{"key":"value"}'
linear_query() {
  local query="$1"
  local variables="${2:-{}}"

  curl -s -X POST "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$query" | jq -Rs .), \"variables\": $variables}"
}

# Resolve a single label name to its UUID for the current team.
# Usage: resolve_label_id "scenario"
resolve_label_id() {
  local name="$1"
  local result
  result=$(linear_query '
    query($filter: IssueLabelFilter) {
      issueLabels(filter: $filter) {
        nodes { id name }
      }
    }
  ' "{\"filter\": {\"name\": {\"eq\": \"$name\"}, \"team\": {\"id\": {\"eq\": \"$LINEAR_TEAM_ID\"}}}}")

  echo "$result" | jq -r '.data.issueLabels.nodes[0].id // empty'
}

# Resolve multiple label names (comma-separated) to a JSON array of UUIDs.
# Usage: resolve_label_ids "scenario,stage:captured"
resolve_label_ids() {
  local names="$1"
  local ids="[]"

  IFS=',' read -ra label_arr <<< "$names"
  for name in "${label_arr[@]}"; do
    name=$(echo "$name" | xargs) # trim whitespace
    local id
    id=$(resolve_label_id "$name")
    if [[ -n "$id" ]]; then
      ids=$(echo "$ids" | jq --arg id "$id" '. + [$id]')
    else
      echo "Warning: label '$name' not found" >&2
    fi
  done

  echo "$ids"
}

# Get an issue by its identifier (e.g., "AVR-123").
# Returns the full issue JSON node.
get_issue_by_identifier() {
  local identifier="$1"
  local result
  result=$(linear_query '
    query($filter: IssueFilter) {
      issues(filter: $filter) {
        nodes {
          id identifier title description url
          labels { nodes { id name } }
          comments { nodes { id body createdAt url user { name } } }
          state { name type }
        }
      }
    }
  ' "{\"filter\": {\"identifier\": {\"eq\": \"$identifier\"}}}")

  echo "$result" | jq '.data.issues.nodes[0] // empty'
}

# Get the workflow state ID by name (e.g., "Done", "Cancelled", "Backlog", "Todo").
# Usage: get_state_id "Done"
get_state_id() {
  local state_name="$1"
  local result
  result=$(linear_query '
    query($filter: WorkflowStateFilter) {
      workflowStates(filter: $filter) {
        nodes { id name type }
      }
    }
  ' "{\"filter\": {\"name\": {\"eq\": \"$state_name\"}, \"team\": {\"id\": {\"eq\": \"$LINEAR_TEAM_ID\"}}}}")

  echo "$result" | jq -r '.data.workflowStates.nodes[0].id // empty'
}
