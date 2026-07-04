import { db } from './db';
import { hoursBetween, nowISO } from './dates';
import type { Fast, StartFastInput, UpdateFastInput } from './types';

/**
 * Thrown when starting a fast while one is already in progress. The route maps
 * this to HTTP 409. The partial unique index `uniq_fast_active` is the DB-level
 * backstop; this pre-check gives a clean error instead of a raw SQLite one.
 */
export class ActiveFastError extends Error {
  constructor() {
    super('A fast is already in progress.');
    this.name = 'ActiveFastError';
  }
}

/** True for a better-sqlite3 UNIQUE/constraint violation (the active-fast index). */
function isConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  );
}

// ── Prepared statements (compiled once) ─────────────────────────────

const stmtActive = db.prepare<[]>(
  `SELECT * FROM fasts WHERE end_at IS NULL LIMIT 1`
);
const stmtList = db.prepare<[]>(
  // Active fast (if any) first, then completed fasts newest-first.
  `SELECT * FROM fasts ORDER BY (end_at IS NULL) DESC, start_at DESC, id DESC`
);
const stmtGet = db.prepare<[number]>(`SELECT * FROM fasts WHERE id = ?`);
const stmtInsert = db.prepare(
  `INSERT INTO fasts (start_at, end_at, goal_hours, note, created_at)
   VALUES (@start_at, @end_at, @goal_hours, @note, @created_at)`
);
const stmtUpdate = db.prepare(
  `UPDATE fasts SET start_at = @start_at, end_at = @end_at,
   goal_hours = @goal_hours, note = @note WHERE id = @id`
);
const stmtDelete = db.prepare<[number]>(`DELETE FROM fasts WHERE id = ?`);

// ── Public API ──────────────────────────────────────────────────────

/** The single in-progress fast, or undefined when none is running. */
export function getActiveFast(): Fast | undefined {
  return stmtActive.get() as Fast | undefined;
}

/** Every fast: the active one first, then completed fasts newest-first. */
export function listFasts(): Fast[] {
  return stmtList.all() as Fast[];
}

export function getFast(id: number): Fast | undefined {
  return stmtGet.get(id) as Fast | undefined;
}

/**
 * Create a fast. With `end_at` omitted it's a live (in-progress) fast and
 * {@link ActiveFastError} is thrown if one is already running. With `end_at`
 * set it's a logged, already-completed fast whose goal is its window length.
 */
export function createFast(input: StartFastInput): Fast {
  const start_at = input.start_at ?? nowISO();
  const end_at = input.end_at ?? null;
  const goal_hours =
    input.goal_hours ??
    (end_at !== null ? hoursBetween(start_at, end_at) : 0);

  // The single-active-fast rule only applies to in-progress fasts.
  if (end_at === null && getActiveFast()) throw new ActiveFastError();
  try {
    const info = stmtInsert.run({
      start_at,
      end_at,
      goal_hours,
      note: input.note ?? '',
      created_at: nowISO(),
    });
    return getFast(Number(info.lastInsertRowid))!;
  } catch (err) {
    // Backstop against a race that slips past the pre-check above.
    if (isConstraintError(err)) throw new ActiveFastError();
    throw err;
  }
}

/**
 * Apply a partial update (edit fields and/or end the fast). Merges over the
 * stored row so omitted fields are preserved. Returns the fresh row, or
 * undefined if the id doesn't exist.
 */
export function updateFast(id: number, input: UpdateFastInput): Fast | undefined {
  const existing = getFast(id);
  if (!existing) return undefined;

  const nextEnd = input.end_at !== undefined ? input.end_at : existing.end_at;
  // Re-opening a fast (end_at → null) must not create a second active fast.
  if (nextEnd === null) {
    const active = getActiveFast();
    if (active && active.id !== id) throw new ActiveFastError();
  }

  try {
    stmtUpdate.run({
      id,
      start_at: input.start_at ?? existing.start_at,
      end_at: nextEnd,
      goal_hours: input.goal_hours ?? existing.goal_hours,
      note: input.note ?? existing.note,
    });
  } catch (err) {
    if (isConstraintError(err)) throw new ActiveFastError();
    throw err;
  }
  return getFast(id);
}

/** End the active/given fast by stamping end_at. Returns the fresh row. */
export function endFast(id: number, endAt: string): Fast | undefined {
  return updateFast(id, { end_at: endAt });
}

/** Delete a fast. Returns true if a row was removed. */
export function deleteFast(id: number): boolean {
  return stmtDelete.run(id).changes > 0;
}
