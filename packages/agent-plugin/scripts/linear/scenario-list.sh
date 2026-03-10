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
  filter=$(jq -n --arg stage "stage:$stage" '{
    labels: { every: { name: { in: ["scenario", $stage] } } },
    team: { id: { eq: env.LINEAR_TEAM_ID } }
  }')
else
  filter=$(jq -n '{
    labels: { some: { name: { eq: "scenario" } } },
    team: { id: { eq: env.LINEAR_TEAM_ID } }
  }')
fi

# Add title search if provided
if [[ -n "$search" ]]; then
  filter=$(echo "$filter" | jq --arg search "$search" '. + {title: {contains: $search}}')
fi

result=$(linear_query '
  query($filter: IssueFilter) {
    issues(filter: $filter, first: 200) {
      nodes {
        identifier title url
        labels { nodes { name } }
      }
    }
  }
' "{\"filter\": $filter}")

echo "$result" | jq '[.data.issues.nodes[] | {
  number: .identifier,
  title,
  stage: (.labels.nodes | map(select(.name | startswith("stage:"))) | .[0].name // "unknown" | ltrimstr("stage:")),
  url
}]'
