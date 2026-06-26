import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * better-sqlite3 singleton.
 *
 * - The DB file lives at DATABASE_PATH (a Railway volume in prod, e.g.
 *   /data/habitator.db). Local dev falls back to ./data/habitator.db.
 * - Schema is created idempotently on open (CREATE TABLE IF NOT EXISTS), so
 *   there is no migration framework to run.
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

export const db: Database.Database =
  globalForDb.__habitatorDb ?? createConnection();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__habitatorDb = db;
}
