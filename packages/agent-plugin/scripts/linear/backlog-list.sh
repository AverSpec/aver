#!/usr/bin/env bash
set -euo pipefail

# List backlog items from Linear Issues.
# Usage: backlog-list [--status open|closed|all] [--priority high] [--type feature]
# Priority accepts: urgent, high, medium, low, none, or P0-P3 shorthand.
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
      echo "Usage: backlog-list [--status open|closed|all] [--priority high] [--type feature]" >&2
      exit 1
      ;;
  esac
done

# Build label filter: must have "backlog" label
label_names='["backlog"]'
[[ -n "$type" ]] && label_names=$(echo "$label_names" | jq --arg t "$type" '. + [$t]')

# Build the filter object — use "and" to require ALL labels via multiple "some" conditions
label_filters="[]"
for label in $(echo "$label_names" | jq -r '.[]'); do
  label_filters=$(echo "$label_filters" | jq --arg n "$label" '. + [{labels: {some: {name: {eq: $n}}}}]')
done

filter=$(jq -nc --argjson ands "$label_filters" --arg tid "$LINEAR_TEAM_ID" '{
  and: $ands,
  team: { id: { eq: $tid } }
}')

# Add native priority filter
if [[ -n "$priority" ]]; then
  priority_int=$(resolve_priority "$priority")
  if [[ -z "$priority_int" ]]; then
    echo "Error: invalid priority '$priority'. Use: urgent, high, medium, low, none, or P0-P3." >&2
    exit 1
  fi
  filter=$(echo "$filter" | jq --argjson p "$priority_int" '. + {priority: {eq: $p}}')
fi

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
  query: "query($filter: IssueFilter) { issues(filter: $filter, first: 200) { nodes { identifier title priority priorityLabel url labels { nodes { name } } state { name type } } } }",
  variables: {filter: $f}
}' > "$_tmp"
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

echo "$result" | jq '[.data.issues.nodes[] | {
  number: .identifier,
  title,
  priority: .priorityLabel,
  _sort: (if .priority == 0 then 99 else .priority end),
  type: (.labels.nodes | map(select(.name | test("^(feature|bug|research|refactor|chore)$"; "i"))) | .[0].name // "none"),
  status: (if .state.type == "completed" or .state.type == "canceled" then "closed" else "open" end),
  url
}] | sort_by(._sort) | [.[] | del(._sort)]'
