#!/usr/bin/env bash
set -euo pipefail

# List scenario issues, optionally filtered by stage or search keyword.
# Usage: scenario-list [--stage captured] [--search "keyword"]
# Output: JSON array of { number, title, stage, url }

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

labels="scenario"
if [[ -n "$stage" ]]; then
  labels="scenario,stage:$stage"
fi

args=(gh issue list --label "$labels" --state open --limit 200 --json number,title,labels,url)

if [[ -n "$search" ]]; then
  args+=(--search "$search")
fi

"${args[@]}" | jq '[.[] | {
  number,
  title,
  stage: (.labels | map(select(.name | startswith("stage:"))) | .[0].name // "unknown" | ltrimstr("stage:")),
  url
}]'
