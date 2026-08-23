#!/usr/bin/env bash
# The build lane's coder step: run aider (DeepSeek by default) against the
# chat's instructions, then loop `npm run build` → feed errors back → retry
# until green (or give up). Runs on the GitHub Actions runner; expects the
# payload files written by the workflow into .agent/. Protected path — the
# agent may not edit this script.
set -euo pipefail

MODEL="${AGENT_CODER_MODEL:-deepseek}"
MAX_FIX_ROUNDS=3

git config user.name "Habitator Agent"
git config user.email "agent@habitator.app"

INSTRUCTIONS="$(cat .agent/instructions.txt)"
MEMORY="$(cat .agent/memory.txt 2>/dev/null || true)"
CONTEXT="$(cat .agent/context.txt 2>/dev/null || true)"

MSG="Implement this change requested by the app's owner via the in-app chat:

$INSTRUCTIONS"

if [ -n "$MEMORY" ]; then
  MSG="$MSG

Durable preferences the owner has expressed before (respect them):
$MEMORY"
fi

if [ -n "$CONTEXT" ]; then
  MSG="$MSG

The chat conversation that led to this request, for intent:
$CONTEXT"
fi

AIDER_FLAGS=(
  --model "$MODEL"
  --yes-always
  --no-check-update
  --no-analytics
  --no-show-model-warnings
  --read AGENT.md
  --read CLAUDE.md
  --read lib/CLAUDE.md
  --read app/api/CLAUDE.md
  --read components/CLAUDE.md
)

echo "── aider: initial implementation ──"
aider "${AIDER_FLAGS[@]}" --message "$MSG"

# aider edits package.json but not the lockfile; keep them in sync so the
# build (and the next `npm ci`) doesn't fall over.
sync_lockfile() {
  if ! git diff --quiet origin/main...HEAD -- package.json; then
    npm install --no-audit --no-fund
    if ! git diff --quiet -- package-lock.json; then
      git add package-lock.json
      git commit -m "chore: sync package-lock.json"
    fi
  fi
}

for ROUND in $(seq 0 "$MAX_FIX_ROUNDS"); do
  sync_lockfile
  echo "── npm run build (round $ROUND) ──"
  if npm run build >build.log 2>&1; then
    echo "build: green"
    exit 0
  fi
  tail -c 2000 build.log
  if [ "$ROUND" -eq "$MAX_FIX_ROUNDS" ]; then
    echo "build: still red after $MAX_FIX_ROUNDS fix rounds — giving up" >&2
    exit 1
  fi
  echo "── aider: fix round $((ROUND + 1)) ──"
  ERRORS="$(tail -c 6000 build.log)"
  aider "${AIDER_FLAGS[@]}" --message "The build failed. Fix ONLY these build errors — do not start new work:

$ERRORS"
done
