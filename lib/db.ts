// PostgreSQL data layer (node-postgres).
//
// Replaces the old single-file better-sqlite3 setup. The app is now multi-user:
// every domain table carries a `user_id` and all queries are scoped to the
// logged-in user (see the lib/* query helpers).
//
// Design notes:
// - The connection Pool is created LAZILY (on first query), never at import.
//   `next build`'s "Collecting page data" phase imports every route module; a
//   Pool created there would try to reach a DB that may not exist at build time.
//   Deferring the open until a handler runs a query keeps the build DB-free.
// - On first use we (idempotently) create the schema and run the one-time
//   SQLite→Postgres migration, serialized across instances with a Postgres
//   advisory lock and memoized so it happens exactly once per process.
// - A globalThis singleton keeps Next.js dev hot-reload from opening many pools.

import { Pool, type PoolClient, type QueryResultRow } from 'pg';

// ── Schema ──────────────────────────────────────────────────────────
//
// Faithful to the old SQLite shape (TEXT dates/timestamps, INTEGER 0/1 flags,
// JSON-as-TEXT for rep target/reps) so migrated rows copy across verbatim — the
// only structural change is the `users` table plus a `user_id` FK on every table
// and per-user uniqueness. All statements are IF NOT EXISTS so re-running the
// schema on every boot against an existing database is a safe no-op.
//
// The INTEGER 0/1 flags (habits.archived, *_sessions.completed) and the
// JSON-in-TEXT columns (*_sessions.target/reps) are deliberate MIGRATION-FIDELITY
// requirements, not un-modernized SQLite leftovers: the one-time importer copies
// these values across byte-for-byte, so they must NOT be "upgraded" to
// boolean/jsonb. See lib/migrate.ts.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
-- Case-insensitive unique usernames.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_username ON users (lower(username));

CREATE TABLE IF NOT EXISTS habits (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  details     TEXT    NOT NULL DEFAULT '',
  exceptions  TEXT    NOT NULL DEFAULT '',
  start_date  TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits (user_id);

CREATE TABLE IF NOT EXISTS entries (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  status     TEXT    NOT NULL CHECK (status IN ('pass','fail')),
  created_at TEXT    NOT NULL,
  UNIQUE (habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_entries_habit_date ON entries (habit_id, date);
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries (user_id, date);

CREATE TABLE IF NOT EXISTS fasts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_at   TEXT             NOT NULL,   -- ISO timestamp
  end_at     TEXT,                        -- ISO timestamp; NULL = in progress
  goal_hours DOUBLE PRECISION NOT NULL,   -- target duration in hours
  note       TEXT             NOT NULL DEFAULT '',
  created_at TEXT             NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fasts_user_start ON fasts (user_id, start_at);
-- At most one in-progress fast (end_at IS NULL) PER USER at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fast_active ON fasts (user_id) WHERE end_at IS NULL;

CREATE TABLE IF NOT EXISTS pushup_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,            -- YYYY-MM-DD (local day of the attempt)
  day_index  INTEGER NOT NULL,            -- program day this attempt targeted
  target     TEXT    NOT NULL,            -- JSON [t1,t2,t3] prescribed reps
  reps       TEXT    NOT NULL,            -- JSON [r1,r2,r3] actual reps done
  completed  INTEGER NOT NULL,            -- 1 if reps met target on every set
  video      TEXT,                        -- optional stored video filename
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pushups_user ON pushup_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_pushups_completed ON pushup_sessions (user_id, completed);

CREATE TABLE IF NOT EXISTS pullup_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  day_index  INTEGER NOT NULL,
  target     TEXT    NOT NULL,
  reps       TEXT    NOT NULL,
  completed  INTEGER NOT NULL,
  video      TEXT,
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pullups_user ON pullup_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_pullups_completed ON pullup_sessions (user_id, completed);

CREATE TABLE IF NOT EXISTS anki_days (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,            -- YYYY-MM-DD (local day studied)
  new_cards  INTEGER NOT NULL,            -- new cards studied that day (>= 0)
  created_at TEXT    NOT NULL,
  UNIQUE (user_id, date)                  -- one row per (user, day); logging upserts
);
CREATE INDEX IF NOT EXISTS idx_anki_user_date ON anki_days (user_id, date);

-- User-defined rep programs — the configurable "template instances" that
-- generalize the two built-ins (pushups/pullups). A row is one program's config;
-- unlike the built-ins (each its own *_sessions table), every user program's
-- sessions live in ONE shared table keyed by program_id.
CREATE TABLE IF NOT EXISTS rep_programs (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  sets         INTEGER NOT NULL,
  day1_total   INTEGER NOT NULL,   -- total reps on day 1
  program_days INTEGER NOT NULL,   -- length of the ramp
  rest_seconds INTEGER NOT NULL,   -- rest between sets
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rep_programs_user ON rep_programs (user_id);

CREATE TABLE IF NOT EXISTS rep_program_sessions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id INTEGER NOT NULL REFERENCES rep_programs(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,            -- YYYY-MM-DD (local day of the attempt)
  day_index  INTEGER NOT NULL,            -- program day this attempt targeted
  target     TEXT    NOT NULL,            -- JSON [t1..] prescribed reps
  reps       TEXT    NOT NULL,            -- JSON [r1..] actual reps done
  completed  INTEGER NOT NULL,            -- 1 if reps met target on every set
  video      TEXT,                        -- optional whole-workout video filename
  videos     TEXT,                        -- optional JSON array of per-set filenames
  created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rep_prog_sessions_prog ON rep_program_sessions (program_id);
CREATE INDEX IF NOT EXISTS idx_rep_prog_sessions_user ON rep_program_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_rep_prog_sessions_completed ON rep_program_sessions (program_id, completed);

-- User-defined plank programs — the timed sibling of rep programs. A row is one
-- program's config (a hold-time ramp start-to-end by step); its sessions live in
-- the shared plank_program_sessions table, keyed by program_id. One HOLD per day,
-- so each session stores a single target/lasted duration (whole seconds) and a
-- single optional video -- no per-set columns. completed stays a 0/1 INTEGER to
-- match the other *_sessions tables (the COUNT(completed = 1) progression plus
-- export/import fidelity), not a boolean.
CREATE TABLE IF NOT EXISTS plank_programs (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  start_seconds INTEGER NOT NULL,   -- day-1 hold target
  end_seconds   INTEGER NOT NULL,   -- final hold target (ramp ceiling)
  step_seconds  INTEGER NOT NULL,   -- seconds added to the target each day
  sort_order    INTEGER NOT NULL DEFAULT 0,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plank_programs_user ON plank_programs (user_id);

CREATE TABLE IF NOT EXISTS plank_program_sessions (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id     INTEGER NOT NULL REFERENCES plank_programs(id) ON DELETE CASCADE,
  date           TEXT    NOT NULL,          -- YYYY-MM-DD (local day of the attempt)
  day_index      INTEGER NOT NULL,          -- program day this attempt targeted
  target_seconds INTEGER NOT NULL,          -- prescribed hold, frozen at log time
  lasted_seconds INTEGER NOT NULL,          -- actual hold achieved
  completed      INTEGER NOT NULL,          -- 1 if lasted >= target
  video          TEXT,                      -- optional stored video filename
  created_at     TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plank_prog_sessions_prog ON plank_program_sessions (program_id);
CREATE INDEX IF NOT EXISTS idx_plank_prog_sessions_user ON plank_program_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_plank_prog_sessions_completed ON plank_program_sessions (program_id, completed);

-- Opt-in for the built-in custom-habit domains (pushups / pullups / japanese).
-- A row means "this user added that habit"; no row means its Today widget and
-- full screen don't exist for them. Nothing is seeded at signup — the user adds
-- them from the add-habit template picker (see lib/domains.ts).
CREATE TABLE IF NOT EXISTS user_domains (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain     TEXT    NOT NULL,   -- 'pushups' | 'pullups' | 'japanese'
  created_at TEXT    NOT NULL,
  UNIQUE (user_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_user_domains_user ON user_domains (user_id);

-- Global key/value store for one-time bootstraps (e.g. the SQLite→Postgres
-- migration flag). Not user-scoped.
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Additive column migrations ────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS never alters an existing table, so new columns
-- on already-created tables go here as guarded ALTERs (safe to re-run every
-- boot). Per-set videos: a JSON-in-TEXT array (one nullable filename per set),
-- alongside the existing single video column (the whole-workout recording).
ALTER TABLE pushup_sessions ADD COLUMN IF NOT EXISTS videos TEXT;
ALTER TABLE pullup_sessions ADD COLUMN IF NOT EXISTS videos TEXT;
-- Habit kind: 'build' (do it daily, check off) vs 'quit' (avoid it, only mark
-- slips). Defaults to 'build' so every pre-existing/migrated habit keeps its
-- current meaning; the app layer validates the value (see lib/validate.ts).
ALTER TABLE habits ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'build';
-- Habit schedule: JSON-in-TEXT (see lib/schedule.ts). NULL ⇒ daily, so every
-- pre-existing/migrated row keeps daily semantics. Nullable + no default keeps
-- migrate.ts's explicit-column INSERT (which omits it) valid.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS schedule TEXT;
-- Habit end date: an optional upper bound to start_date (YYYY-MM-DD). NULL means
-- ongoing (no end). On/before this day the habit behaves normally; after it the
-- habit is no longer due/tracked and its stats freeze at the end date. Nullable
-- + no default keeps migrate.ts's explicit-column INSERT (which omits it) valid,
-- exactly like the schedule column above.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS end_date TEXT;

-- ── Streak exceptions (rest days) ─────────────────────────────────────
-- A user can mark a specific day as an "exception" for any tracker so a missed
-- day does NOT break its streak. Deliberately ORTHOGONAL to entries/*_sessions/
-- anki_days: keeping it a separate table means EntryStatus stays 'pass'|'fail'
-- (no CHECK swap on the existing entries table) and one uniform mechanism covers
-- plain habits AND every custom habit (rep programs, plank, anki). Each streak
-- computation reads the matching (scope, ref) dates and treats them as bridged —
-- an excepted day neither breaks nor extends the streak.
--   scope 'habit' → ref = the habit id (as text)
--   scope 'rep'   → ref = the program key ('pushups' | 'pullups' | 'rep<id>')
--   scope 'plank' → ref = the program key ('plank<id>')
--   scope 'anki'  → ref = 'japanese'
CREATE TABLE IF NOT EXISTS streak_exceptions (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope      TEXT    NOT NULL,   -- 'habit' | 'rep' | 'plank' | 'anki'
  ref        TEXT    NOT NULL,   -- habit id / program key / 'japanese'
  date       TEXT    NOT NULL,   -- YYYY-MM-DD (owner-local day)
  created_at TEXT    NOT NULL,
  UNIQUE (user_id, scope, ref, date)
);
CREATE INDEX IF NOT EXISTS idx_streak_exc_lookup
  ON streak_exceptions (user_id, scope, ref);
`;

// Backfill the custom-habit opt-in for users who predate `user_domains`: if you
// have data in a domain, you obviously have that habit. It runs EXACTLY ONCE
// (guarded by the `user_domains_backfilled` app_meta flag, like the SQLite
// import), not on every boot. Running it every boot would let a *deleted* domain
// come back: the delete drops the opt-in AND the data, but the log routes don't
// gate on domain membership, so a stale open tab could re-create a data row
// after the delete — a per-boot backfill would then re-enable the domain from
// that orphan row. Once-only closes that door. `created_at` is derived from the
// data (no now()), so the backfill is deterministic.
//
// Japanese pins to the deck's original start date rather than the earliest
// logged day: `created_at` is what starts that tracker's pace clock (see
// lib/anki.ts::resolveStartDate), so pinning keeps every pre-existing user's
// day-count, pace, and finish estimates exactly where they were. It MUST stay
// equal to `ANKI.startDate` (a frozen historical constant, hence the literal —
// db.ts can't import anki.ts, which imports back through domains.ts).
const BACKFILL_USER_DOMAINS = `
INSERT INTO user_domains (user_id, domain, created_at)
SELECT user_id, 'pushups', MIN(date) || 'T00:00:00.000Z' FROM pushup_sessions GROUP BY user_id
ON CONFLICT (user_id, domain) DO NOTHING;

INSERT INTO user_domains (user_id, domain, created_at)
SELECT user_id, 'pullups', MIN(date) || 'T00:00:00.000Z' FROM pullup_sessions GROUP BY user_id
ON CONFLICT (user_id, domain) DO NOTHING;

INSERT INTO user_domains (user_id, domain, created_at)
SELECT DISTINCT user_id, 'japanese', '2026-07-04T00:00:00.000Z' FROM anki_days
ON CONFLICT (user_id, domain) DO NOTHING;
`;

// Arbitrary constant identifying the schema/migration advisory lock. Any two
// booting instances contend on this so schema creation + migration run once.
const INIT_LOCK_KEY = 0x48414249; // "HABI"

// ── Directory for app-managed files (uploaded videos) ───────────────
//
// The BASE data directory. Uploaded videos live in `<dataDir>/uploads/` (see
// lib/media.ts), on the Railway volume alongside where the old SQLite file was.
// Resolution: DATA_DIR, else the old SQLite file's directory (DATABASE_PATH),
// else ./data locally.
import path from 'node:path';

export function dataDir(): string {
  const explicit = process.env.DATA_DIR;
  if (explicit && explicit.trim() !== '') return explicit;
  const legacy = process.env.DATABASE_PATH;
  if (legacy && legacy.trim() !== '') return path.dirname(legacy);
  return path.join(process.cwd(), 'data');
}

// ── Pool + one-time init ────────────────────────────────────────────

function sslConfig(): false | { rejectUnauthorized: boolean } {
  const mode = process.env.PGSSL;
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  const url = process.env.DATABASE_URL ?? '';
  // Same-project (Railway private network) and local connections don't use TLS.
  if (
    url.includes('.railway.internal') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1')
  ) {
    return false;
  }
  // External Postgres (incl. Railway's public proxy) needs TLS.
  return { rejectUnauthorized: false };
}

const globalForDb = globalThis as unknown as {
  __habitatorPool?: Pool;
  __habitatorInit?: Promise<void>;
};

function rawPool(): Pool {
  if (!globalForDb.__habitatorPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString || connectionString.trim() === '') {
      throw new Error(
        'DATABASE_URL is not set. Point it at your Postgres instance ' +
          '(Railway: the Postgres plugin exposes DATABASE_URL automatically).'
      );
    }
    globalForDb.__habitatorPool = new Pool({
      connectionString,
      ssl: sslConfig(),
      max: 10,
      // Keep at least one warm connection so the first tap of a burst doesn't
      // pay a cold-connect round-trip.
      min: 1,
      // Enable TCP keepalive so idle sockets aren't silently dropped by a
      // proxy/NAT between the app and Postgres.
      keepAlive: true,
      // Raise the idle timeout from pg's 10s default so warm connections
      // survive short idle gaps instead of being reaped between bursts.
      idleTimeoutMillis: 60000,
    });
  }
  return globalForDb.__habitatorPool;
}

// Cross-instance serialization vs. in-process serialization are two separate
// layers, both required:
//   • The Postgres pg_advisory_lock below serializes the schema + migration
//     critical section ACROSS every booting instance/process.
//   • The `__habitatorInit` memo in ready() serializes concurrent callers
//     WITHIN this process so only one initialize() ever runs at a time here.
async function initialize(): Promise<void> {
  const client = await rawPool().connect();
  try {
    // Serialize schema creation + migration across concurrent booting instances.
    await client.query('SELECT pg_advisory_lock($1)', [INIT_LOCK_KEY]);
    await client.query(SCHEMA);
    // Only load the migrate module (which dlopens the better-sqlite3 native
    // addon) when the one-time SQLite→Postgres import hasn't run yet. On a
    // warm/already-migrated DB the `sqlite_migrated` app_meta flag is present,
    // so we skip the dynamic import entirely and never pay the dlopen.
    // runMigrationOnce is itself idempotent (it re-checks the same flag); this
    // gate is purely to avoid loading the addon. A fresh DB has rowCount === 0,
    // so this path still runs the migration that SETS the flag the first time.
    const migrated = await client.query(
      `SELECT 1 FROM app_meta WHERE key = 'sqlite_migrated'`
    );
    if (migrated.rowCount === 0) {
      // Dynamic import breaks the db↔migrate cycle (migrate uses these helpers).
      const { runMigrationOnce } = await import('./migrate');
      await runMigrationOnce(client);
    }
    // One-time custom-habit opt-in backfill, after the import so freshly-migrated
    // rows enable their domains too. Guarded by an app_meta flag so it runs once
    // ever (not per boot) — see BACKFILL_USER_DOMAINS for why once-only matters.
    const done = await client.query(
      `SELECT 1 FROM app_meta WHERE key = 'user_domains_backfilled'`
    );
    if (done.rowCount === 0) {
      await client.query(BACKFILL_USER_DOMAINS);
      await client.query(
        `INSERT INTO app_meta (key, value) VALUES ('user_domains_backfilled', '1')
         ON CONFLICT (key) DO NOTHING`
      );
    }
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [INIT_LOCK_KEY])
      .catch(() => {});
    client.release();
  }
}

/** Ensure the pool exists and the schema + migration have run (once). */
function ready(): Promise<void> {
  if (!globalForDb.__habitatorInit) {
    // Memoize the in-flight promise so concurrent many/one/run/tx callers all
    // await the SAME initialize() (single initializer per process). But on
    // FAILURE, clear the memo so the next caller retries a fresh initialize()
    // instead of re-awaiting a permanently-rejected promise (which would brick
    // the process after a transient DB hiccup / not-yet-reachable DATABASE_URL).
    // The `=== p` guard makes clearing a no-op if a retry has already replaced
    // the memo, so we never wipe a newer in-flight init.
    const p = initialize();
    globalForDb.__habitatorInit = p;
    p.catch(() => {
      if (globalForDb.__habitatorInit === p) {
        globalForDb.__habitatorInit = undefined;
      }
    });
  }
  return globalForDb.__habitatorInit;
}

// ── Query helpers ───────────────────────────────────────────────────

/** Run a parameterized query and return all rows. */
export async function many<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ready();
  const res = await rawPool().query<T>(text, params as unknown[]);
  return res.rows;
}

/** Run a parameterized query and return the first row (or undefined). */
export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await many<T>(text, params);
  return rows[0];
}

/** Run a statement and return the number of affected rows. */
export async function run(
  text: string,
  params: unknown[] = []
): Promise<number> {
  await ready();
  const res = await rawPool().query(text, params as unknown[]);
  return res.rowCount ?? 0;
}

/**
 * Run `fn` inside a single transaction on a dedicated client. Commits on
 * success, rolls back on any thrown error.
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await rawPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** True for a Postgres unique-violation error (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === '23505'
  );
}
