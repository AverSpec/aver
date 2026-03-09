#!/usr/bin/env bash
set -euo pipefail

# Advance a scenario to a new pipeline stage.
# Removes the old stage:* label and adds the new one.
# Usage: scenario-advance <number> --to <stage>
# Output: JSON { number, url, stage }

valid_stages=("captured" "characterized" "mapped" "specified" "implemented")

if [[ $# -lt 1 ]]; then
  echo "Error: issue number is required" >&2
  echo "Usage: scenario-advance <number> --to <stage>" >&2
  exit 1
fi

number="$1"
shift
to=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) to="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-advance <number> --to <stage>" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$to" ]]; then
  echo "Error: --to is required" >&2
  echo "Usage: scenario-advance <number> --to <stage>" >&2
  exit 1
fi

# Validate stage
valid=false
for s in "${valid_stages[@]}"; do
  if [[ "$s" == "$to" ]]; then
    valid=true
    break
  fi
done

if [[ "$valid" != "true" ]]; then
  echo "Error: invalid stage '$to'. Must be one of: ${valid_stages[*]}" >&2
  exit 1
fi

# Get current stage label
current_stage=$(gh issue view "$number" --json labels --jq '[.labels[].name | select(startswith("stage:"))] | .[0]')

# Remove old stage label if present
if [[ -n "$current_stage" && "$current_stage" != "null" ]]; then
  gh issue edit "$number" --remove-label "$current_stage" > /dev/null
fi

# Add new stage label
url=$(gh issue edit "$number" --add-label "stage:$to")

echo "{\"number\": $number, \"url\": \"$url\", \"stage\": \"$to\"}"
