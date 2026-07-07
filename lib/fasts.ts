import { isUniqueViolation, many, one, run } from './db';
import { hoursBetween, nowISO } from './dates';
import type { Fast, StartFastInput, UpdateFastInput } from './types';

/**
 * Thrown when starting a fast while one is already in progress. The route maps
 * this to HTTP 409. The partial unique index `uniq_fast_active` (one active fast
 * per user) is the DB-level backstop; this pre-check gives a clean error instead
 * of a raw Postgres one.
 */
export class ActiveFastError extends Error {
  constructor() {
    super('A fast is already in progress.');
    this.name = 'ActiveFastError';
  }
}

// ── Public API (all scoped to userId) ───────────────────────────────

/** The single in-progress fast, or undefined when none is running. */
export async function getActiveFast(userId: number): Promise<Fast | undefined> {
  return one<Fast>(
    `SELECT * FROM fasts WHERE user_id = $1 AND end_at IS NULL LIMIT 1`,
    [userId]
  );
}

/** Every fast: the active one first, then completed fasts newest-first. */
export async function listFasts(userId: number): Promise<Fast[]> {
  return many<Fast>(
    `SELECT * FROM fasts WHERE user_id = $1
     ORDER BY (end_at IS NULL) DESC, start_at DESC, id DESC`,
    [userId]
  );
}

export async function getFast(
  userId: number,
  id: number
): Promise<Fast | undefined> {
  return one<Fast>(`SELECT * FROM fasts WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
}

/**
 * Create a fast. With `end_at` omitted it's a live (in-progress) fast and
 * {@link ActiveFastError} is thrown if one is already running. With `end_at`
 * set it's a logged, already-completed fast whose goal is its window length.
 */
export async function createFast(
  userId: number,
  input: StartFastInput
): Promise<Fast> {
  const start_at = input.start_at ?? nowISO();
  const end_at = input.end_at ?? null;
  const goal_hours =
    input.goal_hours ?? (end_at !== null ? hoursBetween(start_at, end_at) : 0);

  // The single-active-fast rule only applies to in-progress fasts.
  if (end_at === null && (await getActiveFast(userId))) {
    throw new ActiveFastError();
  }
  try {
    const row = await one<Fast>(
      `INSERT INTO fasts (user_id, start_at, end_at, goal_hours, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, start_at, end_at, goal_hours, input.note ?? '', nowISO()]
    );
    return row!;
  } catch (err) {
    // Backstop against a race that slips past the pre-check above.
    if (isUniqueViolation(err)) throw new ActiveFastError();
    throw err;
  }
}

/**
 * Apply a partial update (edit fields and/or end the fast). Merges over the
 * stored row so omitted fields are preserved. Returns the fresh row, or
 * undefined if the id doesn't exist for this user.
 */
export async function updateFast(
  userId: number,
  id: number,
  input: UpdateFastInput
): Promise<Fast | undefined> {
  const existing = await getFast(userId, id);
  if (!existing) return undefined;

  const nextEnd = input.end_at !== undefined ? input.end_at : existing.end_at;
  // Re-opening a fast (end_at → null) must not create a second active fast.
  if (nextEnd === null) {
    const active = await getActiveFast(userId);
    if (active && active.id !== id) throw new ActiveFastError();
  }

  try {
    await run(
      `UPDATE fasts SET start_at = $1, end_at = $2, goal_hours = $3, note = $4
       WHERE id = $5 AND user_id = $6`,
      [
        input.start_at ?? existing.start_at,
        nextEnd,
        input.goal_hours ?? existing.goal_hours,
        input.note ?? existing.note,
        id,
        userId,
      ]
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new ActiveFastError();
    throw err;
  }
  return getFast(userId, id);
}

/** End the active/given fast by stamping end_at. Returns the fresh row. */
export async function endFast(
  userId: number,
  id: number,
  endAt: string
): Promise<Fast | undefined> {
  return updateFast(userId, id, { end_at: endAt });
}

/** Delete a fast. Returns true if a row was removed. */
export async function deleteFast(userId: number, id: number): Promise<boolean> {
  return (
    (await run(`DELETE FROM fasts WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])) > 0
  );
}
