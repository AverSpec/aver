#!/usr/bin/env bash
set -euo pipefail

# List backlog items from Linear Issues.
# Usage: backlog-list [--status open|closed|all] [--priority P1] [--type feature]
# Output: JSON array of { number, title, priority, type, status, url }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

status="open"
priority=""
type=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status)   status="$2";   shift 2 ;;
    --priority) priority="$2"; shift 2 ;;
    --type)     type="$2";     shift 2 ;;
    *)
      echo "Error: unknown argument '$1'" >&2
      echo "Usage: backlog-list [--status open|closed|all] [--priority P1] [--type feature]" >&2
      exit 1
      ;;
  esac
done

# Build label filter: must have "backlog" label
label_names='["backlog"]'
[[ -n "$priority" ]] && label_names=$(echo "$label_names" | jq --arg p "$priority" '. + [$p]')
[[ -n "$type" ]]     && label_names=$(echo "$label_names" | jq --arg t "$type" '. + [$t]')

# Build the filter object — use "and" to require ALL labels via multiple "some" conditions
label_filters="[]"
for label in $(echo "$label_names" | jq -r '.[]'); do
  label_filters=$(echo "$label_filters" | jq --arg n "$label" '. + [{labels: {some: {name: {eq: $n}}}}]')
done

filter=$(jq -nc --argjson ands "$label_filters" --arg tid "$LINEAR_TEAM_ID" '{
  and: $ands,
  team: { id: { eq: $tid } }
}')

# Add state filter based on status
# Linear state types: backlog, unstarted, started, completed, cancelled
case "$status" in
  open)
    filter=$(echo "$filter" | jq '. + {state: {type: {nin: ["completed", "canceled"]}}}')
    ;;
  closed)
    filter=$(echo "$filter" | jq '. + {state: {type: {in: ["completed", "canceled"]}}}')
    ;;
  all)
    # No state filter
    ;;
  *)
    echo "Error: invalid status '$status'. Must be open, closed, or all." >&2
    exit 1
    ;;
esac

_tmp=$(mktemp)
jq -n --argjson f "$filter" '{
  query: "query($filter: IssueFilter) { issues(filter: $filter, first: 200) { nodes { identifier title url labels { nodes { name } } state { name type } } } }",
  variables: {filter: $f}
}' > "$_tmp"
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

echo "$result" | jq '[.data.issues.nodes[] | {
  number: .identifier,
  title,
  priority: (.labels.nodes | map(select(.name | test("^P[0-3]$"))) | .[0].name // "none"),
  type: (.labels.nodes | map(select(.name | test("^(feature|bug|research|refactor|chore)$"; "i"))) | .[0].name // "none"),
  status: (if .state.type == "completed" or .state.type == "canceled" then "closed" else "open" end),
  url
}]'
