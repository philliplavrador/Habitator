# Habitator — Claude working rules

## Be concise

Default to the most concise output that answers the question. Lead with the
answer; skip preamble, option surveys, and restating the task. Only expand when
the user explicitly asks for more detail.

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
- The store is **PostgreSQL** (`lib/db.ts`, via `pg`), and it's **multi-user**:
  every domain table has a `user_id` and every query is scoped to the logged-in
  user (resolve it with `getCurrentUserId`/`requireUserId`). When you add a table
  or query, carry `user_id` through — never return or mutate another user's rows.
- Schema changes must stay idempotent (`CREATE TABLE/INDEX IF NOT EXISTS`); prod
  re-runs the schema on every boot against the existing database, so a change must
  be safe to re-apply and must not lose existing data. `CREATE TABLE IF NOT EXISTS`
  won't alter an existing table — add a new column with a guarded `ALTER TABLE …
  ADD COLUMN IF NOT EXISTS`.
- The one-time SQLite→Postgres import (`lib/migrate.ts`) is guarded by the
  `app_meta.sqlite_migrated` flag and runs in a single transaction. Keep the flag
  check and keep the import atomic.

### Pushing

`git push origin main` works directly. `gh` is authenticated and set as git's
credential helper for github.com (via `gh auth setup-git`), which bypasses the
broken Windows credential store (`wincredman`). So the deploy step is just:
`git commit` then `git push origin main`.

If a push ever fails with "Unable to persist credentials with the wincredman
store" or "could not read Username", the gh token has likely expired — re-run
`gh auth login --hostname github.com --git-protocol https --web` then
`gh auth setup-git`. As a last resort, push via the GitHub MCP (`push_files` to
`philliplavrador/Habitator`, branch `main`) and `git reset --hard origin/main`
to realign local.

## Architecture / where things live

Next.js 14 App Router + TypeScript. Single signed-cookie auth; `middleware.ts`
gates every route (verifies the session **signature** at the edge — it does not
decode the uid, so handlers/pages resolve it themselves). Domains: habits,
fasts, pushups, pullups, japanese/anki.

**UI framing — everything except fasting is "just a custom habit."** Only two
domains are distinct enough to be top-level destinations: plain habits (the
Today screen) and fasting (its own tab). Pushups, pullups, and japanese/anki
keep their own data models and full screens, but in the UI they are presented as
custom habits, **not** separate destinations:
- They are **not** tabs in `BottomNav` (only Today / Insights / Fasting are).
- Their Today-screen summary widgets (`RepProgramSummary`, `AnkiSummary`) flow
  **inline within the habit list** in `TodayClient` (passed down as the
  `widgets` prop from `app/page.tsx`), not pinned as a separate section above it.
- Their full screens (`/pushups`, `/pullups`, `/japanese`) still exist and are
  reached via each widget's "Open →" link (or the direct route).

**Custom habits are opt-in, not seeded.** Nothing domain-specific is created
with an account. Adding a habit (`/habits/new`, `NewHabitFlow`) is three steps:
Build / Quit / **Custom**. "Custom" opens a *library* of the trackers coded into
the app — the entries live in `CUSTOM_HABIT_LIBRARY` (`lib/domains.ts`), and
today it offers exactly two: the configurable **progressive rep program** (a
`rep_programs` row — a user can have several) and the **Anki goal** (the
`japanese` domain — one per account). Whether a user has a built-in domain is a
row in **`user_domains`** (`pushups` | `pullups` | `japanese`); the Today widget,
the full screen, and the Insights tiles all gate on it. `pushups`/`pullups` are
no longer offered in the library (a new user builds a rep program instead) but
remain real domains so pre-existing accounts keep them. Each widget carries a
**delete** button (`DeleteWidgetButton`) that removes the habit **and its logged
data**: built-ins via `DELETE /api/domains/[domain]`, user rep programs via
`DELETE /api/rep-programs/[id]`. Boot backfills `user_domains` from existing data
(`lib/db.ts`), so no one loses a tracker in the cutover.

When adding a new *coded-in* custom habit, add it to the library in
`lib/domains.ts` (and, if it's a new domain, a `DomainKey` + its data-table
mapping) — never a new bottom-nav tab. Reserve new tabs for genuinely non-habit
domains (like fasting).

Layout:
- `app/` — pages (server components open with `requirePageContext()`) and
  `app/api/**` route handlers. See **`app/api/CLAUDE.md`**.
- `lib/` — the data/domain layer (Postgres helpers, domain CRUD, pure
  aggregation, auth/session/tz). See **`lib/CLAUDE.md`**.
- `components/` — UI, built on shared `ui/` + `charts/` primitives. See
  **`components/CLAUDE.md`**.

Two invariants worth repeating (details in `lib/CLAUDE.md`):
- **`user_id`-scoping** — every domain query is scoped to the logged-in user;
  the middleware does not decode the uid, so per-handler `getCurrentUserId()` /
  `requireUserId()` is required, and `entries` upserts on `(habit_id, date)`,
  not `user_id`.
- **Migration fidelity** — the store is **PostgreSQL** now. Any `better-sqlite3`
  / `lib/migrate.ts` code is the **one-time** SQLite→Postgres importer (guarded
  by `app_meta.sqlite_migrated`), not the live store — don't delete it, and keep
  `0/1` INTEGER flags and JSON-in-TEXT columns verbatim (never boolean/jsonb).
