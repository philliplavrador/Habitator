import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * better-sqlite3 singleton — opened LAZILY (on first query, never at import).
 *
 * - The DB file lives at DATABASE_PATH (a Railway volume in prod, e.g.
 *   /data/habitator.db). Local dev falls back to ./data/habitator.db.
 * - Schema is created idempotently on open (CREATE TABLE IF NOT EXISTS), so
 *   there is no migration framework to run.
 * - The connection is created on the first real query, NOT when this module is
 *   imported. This matters for `next build`: its "Collecting page data" phase
 *   imports every route module across parallel workers, and if the DB were
 *   opened (and `PRAGMA journal_mode = WAL` run) at import, those workers would
 *   race on the same file and fail the build with SQLITE_BUSY. Deferring the
 *   open until a handler actually runs a query keeps the build from ever
 *   touching the database.
 * - A globalThis singleton prevents Next.js dev hot-reload from opening many
 *   connections to the same file.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS habits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  details     TEXT    NOT NULL DEFAULT '',
  exceptions  TEXT    NOT NULL DEFAULT '',
  start_date  TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,
  status     TEXT    NOT NULL CHECK (status IN ('pass','fail')),
  created_at TEXT    NOT NULL,
  UNIQUE (habit_id, date)
);

CREATE INDEX IF NOT EXISTS idx_entries_habit_date ON entries (habit_id, date);
CREATE INDEX IF NOT EXISTS idx_entries_date ON entries (date);

CREATE TABLE IF NOT EXISTS fasts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_at   TEXT    NOT NULL,            -- ISO timestamp
  end_at     TEXT,                        -- ISO timestamp; NULL = in progress
  goal_hours REAL    NOT NULL,            -- target duration in hours
  note       TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fasts_start ON fasts (start_at);
-- Partial unique index: at most one in-progress fast (end_at IS NULL) at a time.
-- The indexed key is the constant expression (end_at IS NULL) — which is 1 for
-- every active row — so a second active row collides. Indexing end_at itself
-- would NOT work: SQLite treats each NULL as distinct, so the constraint would
-- never fire.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fast_active ON fasts ((end_at IS NULL)) WHERE end_at IS NULL;

CREATE TABLE IF NOT EXISTS pushup_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,            -- YYYY-MM-DD (local day of the attempt)
  day_index  INTEGER NOT NULL,            -- program day this attempt targeted (1..97)
  target     TEXT    NOT NULL,            -- JSON [t1,t2,t3] prescribed reps
  reps       TEXT    NOT NULL,            -- JSON [r1,r2,r3] actual reps done
  completed  INTEGER NOT NULL,            -- 1 if reps met target on every set
  created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pushups_completed ON pushup_sessions (completed);
`;

function resolveDbPath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return path.join(process.cwd(), 'data', 'habitator.db');
}

function createConnection(): Database.Database {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.exec(SCHEMA);
  return conn;
}

const globalForDb = globalThis as unknown as {
  __habitatorDb?: Database.Database;
};

/** Open (and memoize) the real connection on first use. */
function getDb(): Database.Database {
  if (!globalForDb.__habitatorDb) {
    globalForDb.__habitatorDb = createConnection();
  }
  return globalForDb.__habitatorDb;
}

/**
 * A prepared statement whose underlying better-sqlite3 Statement is compiled on
 * first access — so `db.prepare(sql)` at module top level never opens the DB.
 */
function lazyStatement(sql: string): Database.Statement {
  let real: Database.Statement | undefined;
  const resolve = () => (real ??= getDb().prepare(sql));
  return new Proxy({} as Database.Statement, {
    get(_target, prop) {
      const r = resolve();
      const value = Reflect.get(r, prop, r) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(r)
        : value;
    },
  });
}

/**
 * Lazy stand-in for the connection. `db.prepare(sql)` hands back a lazy
 * statement (no connection yet); any other member access resolves the real
 * connection on demand. This keeps every call site
 * (`db.prepare(...).get/all/run`) unchanged while making the module
 * import-safe for the Next.js build.
 */
export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop) {
    if (prop === 'prepare') {
      return (sql: string) => lazyStatement(sql);
    }
    const r = getDb();
    const value = Reflect.get(r, prop, r) as unknown;
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(r)
      : value;
  },
});
