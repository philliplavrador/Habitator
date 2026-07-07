# app/api/ — route handlers

Two route styles. Know which a file is before editing it.

## Rep routes (pushups, pullups) — thin binders
`pushups/**` and `pullups/**` `route.ts` files contain almost no logic: they
import the configured program instance (`pushupProgram` / `pullupProgram`) and
bind a factory from `lib/repRoute.ts`:
- `route.ts` → `createRepCollectionRoute` (`GET` state, `POST` log)
- `[id]/route.ts` → `createRepItemRoute` (`PATCH` reps, `DELETE`)
- `[id]/video/route.ts` → `createRepVideoRoute` (`GET`/`PUT`/`DELETE`, Range-aware) —
  the single whole-workout video (the guided one-take recording)
- `[id]/video/[set]/route.ts` → `createRepSetVideoRoute` (`GET`/`PUT`/`DELETE`) —
  one video per set (0-based index into the `videos` JSON array)

Both `PUT`s take the video as the **raw request body** (not multipart), streamed
straight to disk by `lib/media.ts::saveVideoStream`; the client passes the
filename as a `?name=` query param.

The two programs' route files are **structurally identical** — only the imported
program differs. When you change one program's routes, change the other's in
lockstep; better still, change the factory in `lib/repRoute.ts` so both inherit
it. The request/response contract is defined by the factory, not the binder.

## Non-rep routes (entries, habits, fasts, anki, export)
Hand-written handlers that use the shared `lib/apiRoute.ts` helpers:
- `unauthorized()` — the 401 body.
- `readJson(req)` — parse JSON, `undefined` on malformed (→ 400 'Invalid JSON.').
- `parseId(raw)` — positive-int id or `null` (→ 400 'Bad id.').

Validation lives in `lib/validate.ts` (`parse*Input` → `ParseResult<T>`).

## Invariants for every route

**Per-handler auth is required, not redundant.** The middleware verifies the
session **signature** at the edge but does **not** decode the uid. So every
handler must call `getCurrentUserId()` (→ `unauthorized()` when `null`) itself
and scope all queries to that id. Removing the in-handler check would leave the
route unscoped.

**Runtime directives.** All routes declare `export const runtime = 'nodejs'`.
Data routes also declare `export const dynamic = 'force-dynamic'`.
`login`/`logout` intentionally **omit** `dynamic` (they're inherently dynamic —
they set cookies — and aren't cached).

**Unified error conventions** (keep new routes consistent):
- `401` → `{ error: 'Unauthorized' }`
- malformed body → `400 { error: 'Invalid JSON.' }`
- bad id param → `400 { error: 'Bad id.' }` (entries uses `'Bad habitId.'` /
  `'Bad date.'` for its query params)
- not found → `404 { error: '… not found.' }`

## export/route.ts — version + table list are coupled
`GET /api/export` hardcodes `version: 7` **and** a fixed list of tables
(habits, entries, fasts, pushup_sessions, pullup_sessions, anki_days). When you
add a tracked domain **or a new column on an exported table**, bump `version`
together with the change — the two must not drift. (v7 added `*_sessions.videos`,
the per-set video array; `SELECT *` already carries new columns through.)

## Cross-scope guard (entries)
`POST /api/entries` confirms the habit belongs to the user before writing,
because the entries uniqueness is `(habit_id, date)` **globally** (see
`lib/CLAUDE.md`) — an unchecked `habitId` could clobber another account's row.
It also rejects future dates and dates before the habit's `start_date`.
