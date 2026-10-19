#!/usr/bin/env bash
# SessionStart: make sure the graphify CLI exists, then refresh the code graph.
# Cloud sessions install the pinned CLI; locally we only print a hint.
set -u

GRAPHIFY_VERSION="0.9.92"
export PATH="$HOME/.local/bin:$PATH"

if ! command -v graphify >/dev/null 2>&1; then
  if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
    if command -v uv >/dev/null 2>&1; then
      uv tool install -q "graphifyy==$GRAPHIFY_VERSION" >&2 || exit 0
    else
      python3 -m pip install -q --user "graphifyy==$GRAPHIFY_VERSION" >&2 || exit 0
    fi
  else
    echo "graphify absent : uv tool install graphifyy==$GRAPHIFY_VERSION" >&2
    exit 0
  fi
fi

# AST-only rebuild (no LLM, no API key). Incremental when graphify-out/ exists.
cd "${CLAUDE_PROJECT_DIR:-.}" && graphify update . >/dev/null 2>&1 || true
