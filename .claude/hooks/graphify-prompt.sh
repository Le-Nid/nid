#!/usr/bin/env bash
# UserPromptSubmit: refresh the graph in the background and remind Claude to query it first.
export PATH="$HOME/.local/bin:$PATH"
command -v graphify >/dev/null 2>&1 || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Incremental AST rebuild, detached so the prompt is never delayed.
nohup graphify update . >/dev/null 2>&1 &

if [ -f graphify-out/graph.json ]; then
  echo 'GRAPHIFY: for any codebase question, run `graphify query "<question>"` (or `graphify path`/`graphify explain`) before grep, search or reading source files.'
fi
