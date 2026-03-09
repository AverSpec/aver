#!/usr/bin/env bash
set -euo pipefail

# Resolve a question comment on a scenario issue.
# Replaces ❓ with ✅, appends resolution, and removes has-question if no questions remain.
# Usage: scenario-resolve <number> --comment-id <id> --body "..."
# Output: Updated comment URL

if [[ $# -lt 1 ]]; then
  echo "Error: issue number is required" >&2
  echo "Usage: scenario-resolve <number> --comment-id <id> --body \"...\"" >&2
  exit 1
fi

number="$1"
shift
comment_id=""
body=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --comment-id) comment_id="$2"; shift 2 ;;
    --body)       body="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: scenario-resolve <number> --comment-id <id> --body \"...\"" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$comment_id" ]]; then
  echo "Error: --comment-id is required" >&2
  exit 1
fi

if [[ -z "$body" ]]; then
  echo "Error: --body is required" >&2
  exit 1
fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Get original comment body
original_body=$(gh api "repos/$repo/issues/comments/$comment_id" --jq .body)

# Replace ❓ with ✅ and append resolution
new_body=$(echo "$original_body" | sed 's/❓/✅/')
new_body=$(printf '%s\n\n---\n\n**Resolution:** %s' "$new_body" "$body")

# Update the comment
updated_url=$(gh api "repos/$repo/issues/comments/$comment_id" -X PATCH --field body="$new_body" --jq .html_url)

# Check if any ❓ comments remain on the issue
remaining=$(gh api "repos/$repo/issues/$number/comments" --jq '[.[] | select(.body | startswith("❓"))] | length')

if [[ "$remaining" -eq 0 ]]; then
  gh issue edit "$number" --remove-label "has-question" > /dev/null
fi

echo "$updated_url"
