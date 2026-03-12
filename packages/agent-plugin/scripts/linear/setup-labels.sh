#!/usr/bin/env bash
set -euo pipefail

# Ensure all required Linear labels exist for Aver scenario/backlog tracking.
# Idempotent: creates labels if missing, skips if they already exist.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

# Get existing labels for the team.
# Build label query body to a tmpfile (avoids bash $() brace corruption).
_labels_tmp=$(mktemp)
jq -n --arg tid "$LINEAR_TEAM_ID" '{
  query: "query($filter: IssueLabelFilter) { issueLabels(filter: $filter) { nodes { id name color } } }",
  variables: {filter: {team: {id: {eq: $tid}}}}
}' > "$_labels_tmp"
existing=$(linear_gql "$_labels_tmp")
rm -f "$_labels_tmp"

existing_names=$(echo "$existing" | jq -r '.data.issueLabels.nodes[].name')

ensure_label() {
  local name="$1"
  local color="$2"
  local description="${3:-}"

  if echo "$existing_names" | grep -qx "$name"; then
    echo "  exists: $name"
  else
    local result _tmp
    _tmp=$(mktemp)
    jq -n --arg n "$name" --arg c "$color" --arg d "$description" --arg tid "$LINEAR_TEAM_ID" '{
      query: "mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success issueLabel { id name } } }",
      variables: {input: {name: $n, color: $c, description: $d, teamId: $tid}}
    }' > "$_tmp"
    result=$(linear_gql "$_tmp")
    rm -f "$_tmp"

    local success
    success=$(echo "$result" | jq -r '.data.issueLabelCreate.success')
    if [[ "$success" == "true" ]]; then
      echo "  created: $name"
    else
      echo "  FAILED: $name — $(echo "$result" | jq -r '.errors[0].message // "unknown error"')" >&2
    fi
  fi
}

# Type labels
ensure_label "scenario"  "#0E8A16" "Aver scenario"
ensure_label "backlog"   "#1D76DB" "Aver backlog item"

# Stage labels (scenario pipeline)
ensure_label "stage:captured"       "#FBCA04" "Scenario: captured"
ensure_label "stage:characterized"  "#F9D0C4" "Scenario: characterized"
ensure_label "stage:mapped"         "#C5DEF5" "Scenario: mapped"
ensure_label "stage:specified"      "#BFD4F2" "Scenario: specified"
ensure_label "stage:implemented"    "#0E8A16" "Scenario: implemented"

# Priority: uses Linear's native priority field (urgent/high/medium/low), not labels.

# Item type labels
ensure_label "Feature"  "#A2EEEF" "Feature"
ensure_label "Bug"      "#D73A4A" "Bug"
ensure_label "research" "#D4C5F9" "Research"
ensure_label "refactor" "#C2E0C6" "Refactor"
ensure_label "chore"    "#EDEDED" "Chore"

# Flag labels
ensure_label "has-question" "#E99695" "Has open questions"

echo "Labels configured."
