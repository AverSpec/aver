#!/usr/bin/env bash
set -euo pipefail

# Ensure all required GitHub labels exist for Aver scenario/backlog tracking.
# Idempotent: creates labels if missing, updates them if they already exist.

ensure_label() {
  local name="$1"
  local color="$2"
  local description="${3:-}"

  if gh label list --search "$name" --json name --jq '.[].name' | grep -qx "$name"; then
    gh label edit "$name" --color "$color" --description "$description"
  else
    gh label create "$name" --color "$color" --description "$description"
  fi
}

# Type labels
ensure_label "scenario"  "0E8A16" "Aver scenario"
ensure_label "backlog"   "1D76DB" "Aver backlog item"

# Stage labels (scenario pipeline)
ensure_label "stage:captured"       "FBCA04" "Scenario: captured"
ensure_label "stage:characterized"  "F9D0C4" "Scenario: characterized"
ensure_label "stage:mapped"         "C5DEF5" "Scenario: mapped"
ensure_label "stage:specified"      "BFD4F2" "Scenario: specified"
ensure_label "stage:implemented"    "0E8A16" "Scenario: implemented"

# Priority labels
ensure_label "P0" "B60205" "Critical priority"
ensure_label "P1" "D93F0B" "High priority"
ensure_label "P2" "FBCA04" "Medium priority"
ensure_label "P3" "0E8A16" "Low priority"

# Item type labels
ensure_label "feature"  "A2EEEF" "Feature"
ensure_label "bug"      "D73A4A" "Bug"
ensure_label "research" "D4C5F9" "Research"
ensure_label "refactor" "C2E0C6" "Refactor"
ensure_label "chore"    "EDEDED" "Chore"

# Flag labels
ensure_label "has-question" "E99695" "Has open questions"

echo "Labels configured."
