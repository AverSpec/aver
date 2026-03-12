#!/usr/bin/env bash
# Shared Linear API helper — sourced by all scripts, not executed directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LINEAR_API="https://api.linear.app/graphql"

# Auto-load .env if LINEAR_API_KEY isn't already set.
# Lookup order: cwd .env → ~/.config/aver/.env
if [[ -z "${LINEAR_API_KEY:-}" ]]; then
  if [[ -f "$PWD/.env" ]]; then
    set -a; source "$PWD/.env"; set +a
  elif [[ -f "${XDG_CONFIG_HOME:-$HOME/.config}/aver/.env" ]]; then
    set -a; source "${XDG_CONFIG_HOME:-$HOME/.config}/aver/.env"; set +a
  fi
fi

# Validate required environment variables.
# If LINEAR_TEAM_ID is a short key (e.g. "AI"), resolve it to a UUID.
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/aver"

require_env() {
  if [[ -z "${LINEAR_API_KEY:-}" ]]; then
    echo "Error: LINEAR_API_KEY is not set." >&2
    echo "" >&2
    echo "To configure, run:" >&2
    echo "  npx @aver/agent-plugin setup" >&2
    echo "" >&2
    echo "Or manually create $CONFIG_DIR/.env with:" >&2
    echo "  LINEAR_API_KEY=lin_api_..." >&2
    echo "  LINEAR_TEAM_ID=YOUR_TEAM_KEY" >&2
    exit 1
  fi
  if [[ -z "${LINEAR_TEAM_ID:-}" ]]; then
    echo "Error: LINEAR_TEAM_ID is not set." >&2
    echo "" >&2
    echo "Add LINEAR_TEAM_ID to $CONFIG_DIR/.env or .env in your project root." >&2
    exit 1
  fi

  # Resolve team key to UUID if it doesn't look like a UUID
  if [[ ! "$LINEAR_TEAM_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    local team_key="$LINEAR_TEAM_ID"
    LINEAR_TEAM_ID=$(curl -s -X POST "$LINEAR_API" \
      -H "Authorization: $LINEAR_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"query\": \"{ teams { nodes { id key } } }\"}" \
      | jq -r --arg key "$team_key" '.data.teams.nodes[] | select(.key == $key) | .id // empty')
    if [[ -z "$LINEAR_TEAM_ID" ]]; then
      echo "Error: team key '$team_key' not found" >&2
      exit 1
    fi
    export LINEAR_TEAM_ID
  fi
}

# Execute a GraphQL query against the Linear API.
# Usage: linear_gql <tmpfile>
# The tmpfile must contain a JSON body with {query, variables}.
# All callers build the body themselves and write to a tmpfile.
linear_gql() {
  curl -s -X POST "$LINEAR_API" \
    -H "Authorization: $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d @"$1"
}


# Map a priority name to Linear's native priority integer.
# Accepts both P0-P3 shorthand and Linear's own names.
# Returns integer (0-4) or empty string if invalid.
# Linear values: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
resolve_priority() {
  local input
  input=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  case "$input" in
    p0|urgent|1)  echo 1 ;;
    p1|high|2)    echo 2 ;;
    p2|medium|3)  echo 3 ;;
    p3|low|4)     echo 4 ;;
    none|0)       echo 0 ;;
    *)            echo "" ;;
  esac
}

# Resolve a single label name to its UUID for the current team.
# Usage: resolve_label_id "scenario"
resolve_label_id() {
  local name="$1"
  local _tmp id

  # Try team-scoped labels first
  _tmp=$(mktemp)
  jq -n --arg n "$name" --arg tid "$LINEAR_TEAM_ID" '{
    query: "query($filter: IssueLabelFilter) { issueLabels(filter: $filter) { nodes { id name } } }",
    variables: {filter: {name: {eq: $n}, team: {id: {eq: $tid}}}}
  }' > "$_tmp"
  id=$(linear_gql "$_tmp" | jq -r '.data.issueLabels.nodes[0].id // empty')
  rm -f "$_tmp"

  # Fall back to workspace-level labels (e.g., built-in Bug, Feature)
  # Uses containsIgnoreCase for case-insensitive matching
  if [[ -z "$id" ]]; then
    _tmp=$(mktemp)
    jq -n --arg n "$name" '{
      query: "query($filter: IssueLabelFilter) { issueLabels(filter: $filter) { nodes { id name } } }",
      variables: {filter: {name: {containsIgnoreCase: $n}, team: {null: true}}}
    }' > "$_tmp"
    id=$(linear_gql "$_tmp" | jq -r '[.data.issueLabels.nodes[] | select(.name | ascii_downcase == ($n | ascii_downcase))][0].id // empty' --arg n "$name")
    rm -f "$_tmp"
  fi

  echo "$id"
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
  # Extract the numeric part from identifier (e.g., "AI-7" -> 7)
  local num="${identifier##*-}"
  local _tmp
  _tmp=$(mktemp)
  jq -n --argjson num "$num" '{
    query: "query($filter: IssueFilter) { issues(filter: $filter) { nodes { id identifier title description url labels { nodes { id name } } comments { nodes { id body createdAt url user { name } } } state { name type } } } }",
    variables: {filter: {number: {eq: $num}}}
  }' > "$_tmp"
  local result
  result=$(linear_gql "$_tmp")
  rm -f "$_tmp"

  echo "$result" | jq '.data.issues.nodes[0] // empty'
}

# Get the workflow state ID by name (e.g., "Done", "Cancelled", "Backlog", "Todo").
# Usage: get_state_id "Done"
get_state_id() {
  local state_name="$1"
  local _tmp
  _tmp=$(mktemp)
  jq -n --arg n "$state_name" --arg tid "$LINEAR_TEAM_ID" '{
    query: "query($filter: WorkflowStateFilter) { workflowStates(filter: $filter) { nodes { id name type } } }",
    variables: {filter: {name: {eq: $n}, team: {id: {eq: $tid}}}}
  }' > "$_tmp"
  local result
  result=$(linear_gql "$_tmp")
  rm -f "$_tmp"

  echo "$result" | jq -r '.data.workflowStates.nodes[0].id // empty'
}

# Get the first workflow state ID by type (e.g., "completed", "canceled", "started").
# Works regardless of custom state names.
# Usage: get_state_id_by_type "completed"
get_state_id_by_type() {
  local state_type="$1"
  local _tmp
  _tmp=$(mktemp)
  jq -n --arg t "$state_type" --arg tid "$LINEAR_TEAM_ID" '{
    query: "query($filter: WorkflowStateFilter) { workflowStates(filter: $filter) { nodes { id name type } } }",
    variables: {filter: {type: {eq: $t}, team: {id: {eq: $tid}}}}
  }' > "$_tmp"
  local result
  result=$(linear_gql "$_tmp")
  rm -f "$_tmp"

  echo "$result" | jq -r '.data.workflowStates.nodes[0].id // empty'
}
