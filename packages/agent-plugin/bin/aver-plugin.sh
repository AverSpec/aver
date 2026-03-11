#!/usr/bin/env bash
set -euo pipefail

# CLI entry point for @aver/agent-plugin.
# Usage: aver-plugin setup [linear|gh]

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "${1:-}" in
  setup)
    backend="${2:-linear}"
    case "$backend" in
      linear)
        bash "$PACKAGE_DIR/scripts/linear/setup.sh"
        ;;
      gh)
        bash "$PACKAGE_DIR/scripts/gh/setup-labels.sh"
        ;;
      *)
        echo "Unknown backend: $backend" >&2
        echo "Usage: aver-plugin setup [linear|gh]" >&2
        exit 1
        ;;
    esac
    ;;
  --help|-h|"")
    echo ""
    echo "aver-plugin — Agent plugin for Aver"
    echo ""
    echo "Commands:"
    echo "  aver-plugin setup [linear|gh]   Configure backend credentials and labels"
    echo ""
    echo "Backends:"
    echo "  linear   Interactive setup: API key, team selection, labels (default)"
    echo "  gh       Create required labels in GitHub Issues"
    echo ""
    ;;
  *)
    echo "Unknown command: $1" >&2
    echo "Run 'aver-plugin --help' for usage." >&2
    exit 1
    ;;
esac
