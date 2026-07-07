// One-time SQLite → Postgres migration.
//
// Runs once, at first Postgres init (see lib/db.ts `initialize`), while holding
// the schema advisory lock. It:
//   1. ensures the "Fifi" account exists (the original owner — all pre-existing
//      data belongs to them),
//   2. if the old SQLite database file is present on the volume, copies EVERY
//      row from it into Postgres under Fifi, preserving ids,
//   3. records a flag so it never runs again.
//
// The row copy + the `sqlite_migrated` flag happen in ONE explicit transaction
// (BEGIN…COMMIT in runMigrationOnce), so the DATA import is all-or-nothing: it
// either fully succeeds or rolls back leaving the tables untouched — you can
// never end up with a half-copied dataset. NOTE the one thing OUTSIDE that
// transaction: ensureFifi() runs BEFORE the BEGIN, so its user INSERT
// auto-commits on its own. A failed migration can therefore leave the Fifi
// account created with no data — harmless and idempotent (ON CONFLICT DO
// NOTHING), and the flag is NOT set, so the next boot retries the copy.
// The SQLite file is only READ; it's left in place as a backup.
//
// SERVER-ONLY (better-sqlite3 + node:fs). Imported dynamically by lib/db.ts.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { PoolClient } from 'pg';
import { hashPassword } from './auth';
import { dataDir } from './db';

const MIGRATION_FLAG = 'sqlite_migrated';
const FIFI_USERNAME = 'Fifi';

// Salted scrypt hash of the owner's chosen password (kept out of git as a hash,
// not plaintext). Override at seed time with SEED_FIFI_PASSWORD if you ever want
// a different one for a fresh database.
const FIFI_PASSWORD_HASH =
  'scrypt$85baa56a20eec4879753a3022b29f37e$829e581bc8a60b495d0236e0adbfd4d42fe11ba86b76124e592ff3f8b8124e770fa3efa7d609e7c755a19fa92f0cc10ba3763554894ef5567ba9e2f84d3fed08';

/**
 * Where the old SQLite file lived (Railway volume in prod, ./data locally).
 *
 * Resolution matches lib/db.ts `dataDir()` so the migration SOURCE and the
 * uploads directory never disagree:
 *   • DATABASE_PATH set  → that exact file (documented config; byte-identical to
 *     before, and dataDir() derives its base from dirname(DATABASE_PATH)).
 *   • DATABASE_PATH unset → `<dataDir()>/habitator.db`, so a DATA_DIR-only setup
 *     (which dataDir honors but the old sqlitePath ignored) now resolves to the
 *     same volume as the uploads. With neither var set this is cwd/data/
 *     habitator.db — identical to the previous fallback.
 */
function sqlitePath(): string {
  const fromEnv = process.env.DATABASE_PATH;
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;
  return path.join(dataDir(), 'habitator.db');
}

/** Ensure the Fifi account exists; return its id. Never overwrites an existing one. */
async function ensureFifi(client: PoolClient): Promise<number> {
  const hash = process.env.SEED_FIFI_PASSWORD
    ? hashPassword(process.env.SEED_FIFI_PASSWORD)
    : FIFI_PASSWORD_HASH;
  const now = new Date().toISOString();
  await client.query(
    `INSERT INTO users (username, password_hash, created_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (lower(username)) DO NOTHING`,
    [FIFI_USERNAME, hash, now]
  );
  const res = await client.query<{ id: number }>(
    `SELECT id FROM users WHERE lower(username) = lower($1)`,
    [FIFI_USERNAME]
  );
  return res.rows[0].id;
}

/** True if the SQLite DB has a table of that name. */
function hasTable(sqlite: Database.Database, name: string): boolean {
  return !!sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(name);
}

type Row = Record<string, unknown>;

/**
 * Copy one SQLite table into the matching Postgres table under `userId`,
 * preserving ids. `columns` are the Postgres columns to fill from each SQLite
 * row (id first). `map` pulls each column's value from a SQLite row (with
 * defaults for columns that may be absent in older schemas). Returns the number
 * of rows copied so the caller can bump the id sequence.
 */
async function copyTable(
  client: PoolClient,
  sqlite: Database.Database,
  table: string,
  columns: string[],
  map: (r: Row) => unknown[],
  userId: number
): Promise<number> {
  if (!hasTable(sqlite, table)) return 0;
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Row[];
  if (rows.length === 0) return 0;

  // Columns are: id, user_id, then the rest. Placeholders $1..$n.
  const cols = [columns[0], 'user_id', ...columns.slice(1)];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const insert = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;

  for (const r of rows) {
    const mapped = map(r); // [id, ...rest] (no user_id)
    const values = [mapped[0], userId, ...mapped.slice(1)];
    await client.query(insert, values);
  }

  // Bump the SERIAL sequence past the largest migrated id so future inserts
  // don't collide with the preserved ids. SAFE ONLY because of the
  // `rows.length === 0` early-return above: on an empty table `SELECT MAX(id)`
  // is NULL, and setval(seq, NULL, true) would throw — so we must never reach
  // this line with zero rows.
  await client.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'),
                   (SELECT MAX(id) FROM ${table}), true)`,
    [table]
  );
  return rows.length;
}

/** Run the migration exactly once. `client` already holds the init advisory lock. */
export async function runMigrationOnce(client: PoolClient): Promise<void> {
  // Already migrated? (Flag is set inside the same transaction as the copy.)
  const flag = await client.query(
    `SELECT value FROM app_meta WHERE key = $1`,
    [MIGRATION_FLAG]
  );
  if (flag.rows.length > 0) return;

  const fifiId = await ensureFifi(client);

  const file = sqlitePath();
  const fileExists = (() => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  })();

  await client.query('BEGIN');
  try {
    let summary = 'no SQLite file — nothing to import';

    if (fileExists) {
      // Open read-write (default) so any pending WAL is applied and we read
      // every committed row. The file is only read; its data is unchanged.
      const sqlite = new Database(file, { fileMustExist: true });
      try {
        const counts: Record<string, number> = {};

        counts.habits = await copyTable(
          client,
          sqlite,
          'habits',
          ['id', 'name', 'details', 'exceptions', 'start_date', 'sort_order', 'archived', 'created_at'],
          (r) => [
            r.id,
            r.name,
            r.details ?? '',
            r.exceptions ?? '',
            r.start_date,
            r.sort_order ?? 0,
            r.archived ?? 0,
            r.created_at,
          ],
          fifiId
        );

        counts.entries = await copyTable(
          client,
          sqlite,
          'entries',
          ['id', 'habit_id', 'date', 'status', 'created_at'],
          (r) => [r.id, r.habit_id, r.date, r.status, r.created_at],
          fifiId
        );

        counts.fasts = await copyTable(
          client,
          sqlite,
          'fasts',
          ['id', 'start_at', 'end_at', 'goal_hours', 'note', 'created_at'],
          (r) => [r.id, r.start_at, r.end_at ?? null, r.goal_hours, r.note ?? '', r.created_at],
          fifiId
        );

        counts.pushup_sessions = await copyTable(
          client,
          sqlite,
          'pushup_sessions',
          ['id', 'date', 'day_index', 'target', 'reps', 'completed', 'video', 'created_at'],
          (r) => [r.id, r.date, r.day_index, r.target, r.reps, r.completed, r.video ?? null, r.created_at],
          fifiId
        );

        counts.pullup_sessions = await copyTable(
          client,
          sqlite,
          'pullup_sessions',
          ['id', 'date', 'day_index', 'target', 'reps', 'completed', 'video', 'created_at'],
          (r) => [r.id, r.date, r.day_index, r.target, r.reps, r.completed, r.video ?? null, r.created_at],
          fifiId
        );

        counts.anki_days = await copyTable(
          client,
          sqlite,
          'anki_days',
          ['id', 'date', 'new_cards', 'created_at'],
          (r) => [r.id, r.date, r.new_cards, r.created_at],
          fifiId
        );

        summary = Object.entries(counts)
          .map(([t, n]) => `${t}=${n}`)
          .join(', ');
      } finally {
        sqlite.close();
      }
    }

    await client.query(
      `INSERT INTO app_meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [MIGRATION_FLAG, new Date().toISOString()]
    );
    await client.query('COMMIT');
    // eslint-disable-next-line no-console
    console.log(`[migrate] SQLite→Postgres complete for "${FIFI_USERNAME}": ${summary}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // eslint-disable-next-line no-console
    console.error('[migrate] failed — Postgres left unchanged:', err);
    throw err;
  }
}
