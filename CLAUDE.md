# Habitator — Claude working rules

## Auto-deploy verified changes

Habitator's live server runs on **Railway, which auto-deploys on every push to
`main`** (Nixpacks, no Dockerfile). So "deploy" / "push to the live server" just
means: commit and push to `origin/main`.

**Rule:** After making a change, verify it actually works — and if it does,
push it to the live server automatically, without waiting to be asked each time.
This is standing authorization to deploy; don't re-ask per change.

A change "works" when, in order:

1. `npm run build` passes (types + compile), and
2. the changed behavior is exercised end-to-end and observed to work — e.g. run
   the dev server and drive the affected flow / API, not just tests (the
   `/verify` skill covers this).

Then, only if both pass:

3. Commit with a clear message, ending with the trailer
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
4. Push to `origin/main` (this is what triggers the Railway deploy — pushing to
   any other branch does **not** deploy). Report the deployed commit afterward.

If verification fails, **do not push** — fix it or report the failure. Push a
change only when it's a complete, working unit, not mid-way through multi-step
work.

### Guardrails (never skip)

- Never commit secrets or the database: `.env*` and `data/` stay gitignored.
- Schema changes must stay idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`); prod
  re-runs the schema on every boot against the existing volume DB, so a change
  must be safe to re-apply and must not lose existing data.

### Pushing — current caveat

Local git can't reach the Windows credential store (`git push` fails with
"Unable to persist credentials with the wincredman store") and the `gh` token is
invalid. Until that's fixed, push through the **GitHub MCP** (`push_files` to
`philliplavrador/Habitator`, branch `main`), then `git fetch` +
`git diff origin/main` (expect empty) + `git reset --hard origin/main` to realign
local and confirm the pushed content matches. Prefer a real `git push` once
`gh auth login` is refreshed.
