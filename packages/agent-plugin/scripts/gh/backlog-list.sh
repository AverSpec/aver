#!/usr/bin/env bash
set -euo pipefail

# List backlog items from GitHub Issues.
# Usage: backlog-list [--status open|closed|all] [--priority P1] [--type feature]
# Output: JSON array of { number, title, priority, type, status, url }

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

labels="backlog"
[[ -n "$priority" ]] && labels="$labels,$priority"
[[ -n "$type" ]]     && labels="$labels,$type"

gh issue list --label "$labels" --state "$status" --limit 200 \
  --json number,title,labels,url,state \
| jq '[.[] | {
    number,
    title,
    priority: (.labels | map(select(.name | test("^P[0-3]$"))) | .[0].name // "none"),
    type: (.labels | map(select(.name | test("^(feature|bug|research|refactor|chore)$"))) | .[0].name // "none"),
    status: .state,
    url
  }]'
