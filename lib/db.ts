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
    // Dynamic import breaks the db↔migrate cycle (migrate uses these helpers).
    const { runMigrationOnce } = await import('./migrate');
    await runMigrationOnce(client);
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
