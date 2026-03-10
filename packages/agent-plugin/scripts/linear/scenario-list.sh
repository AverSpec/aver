#!/usr/bin/env bash
set -euo pipefail

# List scenario issues, optionally filtered by stage or search keyword.
# Usage: scenario-list [--stage captured] [--search "keyword"]
# Output: JSON array of { number, title, stage, url }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_linear.sh"
require_env

stage=""
search=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)  stage="$2"; shift 2 ;;
    --search) search="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-list [--stage <stage>] [--search \"keyword\"]" >&2
      exit 1
      ;;
  esac
done

# Build filter: must have "scenario" label, optionally also "stage:<stage>"
if [[ -n "$stage" ]]; then
  filter=$(jq -nc --arg stage "stage:$stage" --arg tid "$LINEAR_TEAM_ID" '{
    labels: { every: { name: { in: ["scenario", $stage] } } },
    team: { id: { eq: $tid } }
  }')
else
  filter=$(jq -nc --arg tid "$LINEAR_TEAM_ID" '{
    labels: { some: { name: { eq: "scenario" } } },
    team: { id: { eq: $tid } }
  }')
fi

# Add title search if provided
if [[ -n "$search" ]]; then
  filter=$(echo "$filter" | jq --arg search "$search" '. + {title: {contains: $search}}')
fi

_tmp=$(mktemp)
jq -n --argjson f "$filter" '{
  query: "query($filter: IssueFilter) { issues(filter: $filter, first: 200) { nodes { identifier title url labels { nodes { name } } } } }",
  variables: {filter: $f}
}' > "$_tmp"
result=$(linear_gql "$_tmp")
rm -f "$_tmp"

echo "$result" | jq '[.data.issues.nodes[] | {
  number: .identifier,
  title,
  stage: (.labels.nodes | map(select(.name | startswith("stage:"))) | .[0].name // "unknown" | ltrimstr("stage:")),
  url
}]'
