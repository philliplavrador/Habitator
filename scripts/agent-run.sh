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

# Every aider call gets a hard per-invocation timeout: a weak model can loop
# "let me check…" forever without emitting an edit (seen live for 25 minutes),
# and failing fast turns that into a reported failure instead of a silent
# 30-minute job-ceiling cancellation.
AIDER_TIMEOUT="${AGENT_AIDER_TIMEOUT:-480}"

run_aider() {
  timeout --signal=TERM "$AIDER_TIMEOUT" aider "${AIDER_FLAGS[@]}" --message "$1" || {
    RC=$?
    if [ "$RC" -eq 124 ]; then
      echo "aider timed out after ${AIDER_TIMEOUT}s (model likely looping without edits)" >&2
    fi
    return "$RC"
  }
}

echo "── aider: initial implementation ──"
run_aider "$MSG"

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

# Each round: guard first (catches junk paths / rule violations while the
# model can still fix them), then the build. Either failure is fed back to
# aider verbatim. The workflow re-runs the guard after this script as the
# hard gate — this in-loop pass is the self-healing one.
for ROUND in $(seq 0 "$MAX_FIX_ROUNDS"); do
  sync_lockfile
  PROBLEM=""
  echo "── guard (round $ROUND) ──"
  if ! GUARD_OUT="$(node scripts/agent-guard.mjs 2>&1)"; then
    echo "$GUARD_OUT"
    PROBLEM="Your change violates the repo rules below. Fix it: move wrongly-placed files to their correct paths (git mv/rm — deleting a junk path is allowed), keep edits inside the allowed tree, and never touch protected paths.

$GUARD_OUT"
  else
    echo "── npm run build (round $ROUND) ──"
    if npm run build >build.log 2>&1; then
      echo "build: green"
      exit 0
    fi
    tail -c 2000 build.log
    PROBLEM="The build failed. Fix ONLY these build errors — do not start new work:

$(tail -c 6000 build.log)"
  fi
  if [ "$ROUND" -eq "$MAX_FIX_ROUNDS" ]; then
    echo "still failing after $MAX_FIX_ROUNDS fix rounds — giving up" >&2
    exit 1
  fi
  echo "── aider: fix round $((ROUND + 1)) ──"
  run_aider "$PROBLEM"
done
