import { many, one, run } from './db';
import { deleteExceptionsForRef } from './exceptions';
import { parseSchedule, serializeSchedule } from './schedule';
import type { Habit, HabitInput } from './types';

// All queries are scoped to `userId` so each account only ever sees its own
// habits.

// The raw DB row: identical to Habit except `schedule` is the JSON-in-TEXT
// column (NULL ⇒ daily). Every read maps through `hydrate` so callers always get
// a parsed `Schedule` object, never the raw string.
type HabitRow = Omit<Habit, 'schedule'> & { schedule: string | null };

function hydrate(row: HabitRow): Habit {
  return { ...row, schedule: parseSchedule(row.schedule) };
}

/** Active (non-archived) habits, in display order. */
export async function listActiveHabits(userId: number): Promise<Habit[]> {
  const rows = await many<HabitRow>(
    `SELECT * FROM habits WHERE user_id = $1 AND archived = 0
     ORDER BY sort_order ASC, id ASC`,
    [userId]
  );
  return rows.map(hydrate);
}

/** Every habit, archived last. */
export async function listAllHabits(userId: number): Promise<Habit[]> {
  const rows = await many<HabitRow>(
    `SELECT * FROM habits WHERE user_id = $1
     ORDER BY archived ASC, sort_order ASC, id ASC`,
    [userId]
  );
  return rows.map(hydrate);
}

export async function getHabit(
  userId: number,
  id: number
): Promise<Habit | undefined> {
  const row = await one<HabitRow>(
    `SELECT * FROM habits WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return row ? hydrate(row) : undefined;
}

/** Create a habit; appends to the end of the manual sort order. */
export async function createHabit(
  userId: number,
  input: HabitInput
): Promise<Habit> {
  const row = await one<{ maxorder: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS maxorder FROM habits WHERE user_id = $1`,
    [userId]
  );
  const maxOrder = row?.maxorder ?? -1;
  const created = await one<HabitRow>(
    `INSERT INTO habits (user_id, name, details, exceptions, kind, schedule, start_date, end_date, sort_order, archived, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10) RETURNING *`,
    [
      userId,
      input.name,
      input.details,
      input.exceptions,
      input.kind,
      serializeSchedule(input.schedule),
      input.start_date,
      input.end_date,
      maxOrder + 1,
      new Date().toISOString(),
    ]
  );
  return hydrate(created!);
}

/** Update a habit's editable fields. Returns the fresh row, or undefined. */
export async function updateHabit(
  userId: number,
  id: number,
  input: HabitInput
): Promise<Habit | undefined> {
  const changed = await run(
    `UPDATE habits SET name = $1, details = $2, exceptions = $3, kind = $4, schedule = $5, start_date = $6, end_date = $7
     WHERE id = $8 AND user_id = $9`,
    [
      input.name,
      input.details,
      input.exceptions,
      input.kind,
      serializeSchedule(input.schedule),
      input.start_date,
      input.end_date,
      id,
      userId,
    ]
  );
  if (changed === 0) return undefined;
  return getHabit(userId, id);
}

/** Toggle archived flag. Returns the fresh row, or undefined. */
export async function setHabitArchived(
  userId: number,
  id: number,
  archived: boolean
): Promise<Habit | undefined> {
  const changed = await run(
    `UPDATE habits SET archived = $1 WHERE id = $2 AND user_id = $3`,
    [archived ? 1 : 0, id, userId]
  );
  if (changed === 0) return undefined;
  return getHabit(userId, id);
}

/** Delete a habit. Its entries cascade away via the FK. True if removed. */
export async function deleteHabit(userId: number, id: number): Promise<boolean> {
  const removed =
    (await run(`DELETE FROM habits WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])) > 0;
  // Entries cascade via the FK, but rest days don't (streak_exceptions keys the
  // habit by a text ref, not a foreign key) — clear them explicitly.
  if (removed) await deleteExceptionsForRef(userId, 'habit', String(id));
  return removed;
}
