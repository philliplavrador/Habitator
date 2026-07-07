# lib/ — data & domain layer

Server-side data/domain code plus a few client-safe helpers. Read this before
touching a query, a streak, or the migration.

## Module map (by role)

**Infrastructure**
- `db.ts` — Postgres (`pg`) layer. Exports `many`/`one`/`run`/`tx` +
  `isUniqueViolation` + `dataDir()`. Pool is opened **lazily** on first query
  (never at import — `next build` imports every route). First query runs the
  schema (all `IF NOT EXISTS`) and the one-time migration under a pg advisory
  lock, memoized once per process.
- `session.ts` — runtime-agnostic (Web Crypto only) signed-token sign/verify.
  Shared by the Edge middleware and Node handlers. Must **never** import
  `node:crypto` or `pg` or it breaks the middleware bundle.
- `auth.ts` — Node-only auth: scrypt password hash/verify, `users` table CRUD,
  `getCurrentUserId()` / `requireUserId()`. No `getUserById` (removed).
- `tz.ts` — server-only owner timezone from the `tz` cookie (pulls
  `next/headers`; never import from client).
- `dates.ts` — client-safe local-day + timestamp helpers; also owns `TZ_COOKIE`
  and `isValidTimeZone` (lives here, not tz.ts, because both sides need them).
- `migrate.ts` — one-time SQLite→Postgres importer (see invariants below).
- `media.ts` — server-only rep-program video storage (`<dataDir>/uploads/`).
  Uploads STREAM to disk (`saveVideoStream`, raw body → byte-counter guard, no
  in-memory buffering), reads are Range-aware (`buildVideoResponse`), plus a
  path-traversal guard. Holds both the whole-workout `video` and the per-set
  `videos` for a session.
- `pageContext.ts` — `requirePageContext()` → `{ userId, tz, today }`; redirects
  to /login when unauthed. Standard server-page opener.
- `apiRoute.ts` — shared route helpers: `unauthorized()`, `readJson()`,
  `parseId()`. The unified error contract.
- `habitPage.ts` — `loadHabitOr404()` for the habit detail/edit pages.
- `validate.ts` — request-body validators returning `ParseResult<T>`.
- `client.ts` — **browser** fetch helpers (`api*`). Pure fetch, no server
  imports — safe to bundle into client components.
- `types.ts` — shared domain types.

**Domain CRUD (every function takes `userId` first, scopes every query)**
- `habits.ts`, `entries.ts`, `fasts.ts`, `anki.ts`
- Rep programs are a generic engine, not per-program CRUD:
  `repProgram.ts` (the engine: `createRepProgram(config)`) + `repRoute.ts` (HTTP
  handler factories) + tiny config modules `pushups.ts` / `pullups.ts`.

**Pure aggregation (no DB — callers pass rows in)**
- `analytics.ts` — habit/fast/rep/anki chart series + streak helpers.
- `stats.ts` — habit completion stats + streaks.
- `fastStats.ts` — completed-fast summary (delegates to `analytics`).

## Load-bearing invariants

### 1. Everything is `user_id`-scoped
Every domain query filters by `user_id`. The middleware verifies the session
signature at the edge but does **not** decode the uid — so each handler/page
must resolve it itself via `getCurrentUserId()` / `requireUserId()`. Carry
`user_id` through any new table or query; never read or mutate another user's
rows.

### 2. entries conflict target is `(habit_id, date)`
`setEntry`'s upsert is `ON CONFLICT (habit_id, date)`, **not** `user_id`. The
uniqueness is global per habit/day, so a caller accepting an untrusted `habitId`
must first confirm the habit belongs to the user (the entries route does this) —
`lib/entries.ts` trusts its arguments.

### 3. Migration fidelity (do not "modernize")
The schema mirrors the old SQLite shape on purpose so migrated rows copy across
verbatim:
- `0/1 INTEGER` flags (`habits.archived`, `*_sessions.completed`) stay INTEGER —
  never boolean.
- `target`/`reps` are **JSON-in-TEXT** — never jsonb. `repProgram.hydrate`
  `JSON.parse`s them.
- Do **not** delete `migrate.ts` or `better-sqlite3` (dependency +
  `next.config` external): it's the live one-time cutover, guarded by the
  `app_meta.sqlite_migrated` flag, run in a single transaction (all-or-nothing),
  reads the SQLite file only (left as backup).

### 4. Three streak implementations, deliberately different
- `stats.ts::computeStats` — **list-position** walk over recorded entries
  (blanks skipped; a `fail` breaks; most-recent-recorded fail ⇒ current 0).
- `analytics.ts::streakOverDays` — **calendar-day set** walk over a `Set<string>`
  of covered days, with today-or-yesterday grace. Both `attemptStreak` (rep
  session days) and `consecutiveFastingStreak` (fast-covered days) delegate here.
- `anki.ts::computeStreak` — **met-daily-minimum** days, with today-grace but a
  logged-below-min today breaks immediately.
Don't unify them — the semantics are intentionally distinct.

### 5. Rate scale: 0..1 vs 0..100
- `stats.ts` emits completion rates as **0..1 fractions**; `formatRate` consumes
  0..1.
- `analytics.ts` emits **0..100 percents** (`RatePoint`, `WeekdayPoint`,
  `weekdayColor`). Don't mix the two.

### 6. Batched stats must match single-habit stats
`getHabitStatsBatch` / `getCurrentStreaksBatch` replace N+1 per-habit queries
with one user-scoped `... habit_id = ANY($2)` query, then run the **same**
`computeStats` on in-memory groups (filtered to `date >= start_date`). They must
stay numerically identical to `getHabitStats` / `getCurrentStreak`.

### 7. db ↔ migrate cycle break
`db.ts::initialize` imports `./migrate` via a **dynamic** `import()` because
`migrate.ts` imports `dataDir`/`hashPassword` back from `db`/`auth`. Keep it a
dynamic import.

## Rep engine notes
Progression is driven purely by `COUNT(completed = 1)`, not the calendar — so a
skipped day or a short attempt never advances the program. `target`/`day_index`
are frozen at log time; editing reps only recomputes `completed`, keeping the
count self-consistent. The `config.table` name is an internal constant (safe to
inline into SQL); all real values are bound parameters.
