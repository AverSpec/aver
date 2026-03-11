#!/usr/bin/env bash
set -euo pipefail

# Interactive setup for Linear integration.
# Creates ~/.config/aver/.env with LINEAR_API_KEY and LINEAR_TEAM_ID.

CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/aver"
CONFIG_FILE="$CONFIG_DIR/.env"
LINEAR_API="https://api.linear.app/graphql"

echo "Aver — Linear Integration Setup"
echo "================================"
echo ""

# Check for existing config
if [[ -f "$CONFIG_FILE" ]]; then
  echo "Existing config found at $CONFIG_FILE"
  read -rp "Overwrite? [y/N] " overwrite
  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    echo "Keeping existing config."
    exit 0
  fi
  echo ""
fi

# Get API key
echo "1. Create a Linear API key at: https://linear.app/settings/api"
echo "   (Personal API keys → Create key)"
echo ""
read -rsp "Paste your LINEAR_API_KEY: " api_key
echo ""

if [[ -z "$api_key" ]]; then
  echo "Error: API key cannot be empty." >&2
  exit 1
fi

# Validate the key by fetching teams
echo ""
echo "Validating key..."
teams_response=$(curl -s -X POST "$LINEAR_API" \
  -H "Authorization: $api_key" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ teams { nodes { id key name } } }"}')

team_count=$(echo "$teams_response" | jq -r '.data.teams.nodes | length' 2>/dev/null || echo "0")

if [[ "$team_count" == "0" ]]; then
  echo "Error: Invalid API key or no teams found." >&2
  exit 1
fi

echo "Authenticated successfully."
echo ""

# Select team
echo "2. Select your team:"
echo ""
echo "$teams_response" | jq -r '.data.teams.nodes[] | "   \(.key) — \(.name)"'
echo ""
read -rp "Enter team key (e.g. AI): " team_key

if [[ -z "$team_key" ]]; then
  echo "Error: Team key cannot be empty." >&2
  exit 1
fi

# Validate team key
team_name=$(echo "$teams_response" | jq -r --arg key "$team_key" '.data.teams.nodes[] | select(.key == $key) | .name // empty')
if [[ -z "$team_name" ]]; then
  echo "Error: Team '$team_key' not found." >&2
  exit 1
fi

# Write config
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_FILE" <<EOF
LINEAR_API_KEY=$api_key
LINEAR_TEAM_ID=$team_key
EOF
chmod 600 "$CONFIG_FILE"

echo ""
echo "Config saved to $CONFIG_FILE"
echo "Team: $team_name ($team_key)"
echo ""

# Offer to set up labels
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
read -rp "Set up Aver labels in Linear? [Y/n] " setup_labels
if [[ ! "$setup_labels" =~ ^[Nn]$ ]]; then
  echo ""
  echo "Creating labels..."
  bash "$SCRIPT_DIR/setup-labels.sh"
fi

echo ""
echo "Done! Linear integration is ready."
