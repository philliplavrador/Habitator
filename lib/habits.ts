import { many, one, run } from './db';
import type { Habit, HabitInput } from './types';

// All queries are scoped to `userId` so each account only ever sees its own
// habits.

/** Active (non-archived) habits, in display order. */
export async function listActiveHabits(userId: number): Promise<Habit[]> {
  return many<Habit>(
    `SELECT * FROM habits WHERE user_id = $1 AND archived = 0
     ORDER BY sort_order ASC, id ASC`,
    [userId]
  );
}

/** Every habit, archived last. */
export async function listAllHabits(userId: number): Promise<Habit[]> {
  return many<Habit>(
    `SELECT * FROM habits WHERE user_id = $1
     ORDER BY archived ASC, sort_order ASC, id ASC`,
    [userId]
  );
}

export async function getHabit(
  userId: number,
  id: number
): Promise<Habit | undefined> {
  return one<Habit>(`SELECT * FROM habits WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
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
  const created = await one<Habit>(
    `INSERT INTO habits (user_id, name, details, exceptions, start_date, sort_order, archived, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7) RETURNING *`,
    [
      userId,
      input.name,
      input.details,
      input.exceptions,
      input.start_date,
      maxOrder + 1,
      new Date().toISOString(),
    ]
  );
  return created!;
}

/** Update a habit's editable fields. Returns the fresh row, or undefined. */
export async function updateHabit(
  userId: number,
  id: number,
  input: HabitInput
): Promise<Habit | undefined> {
  const changed = await run(
    `UPDATE habits SET name = $1, details = $2, exceptions = $3, start_date = $4
     WHERE id = $5 AND user_id = $6`,
    [input.name, input.details, input.exceptions, input.start_date, id, userId]
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
  return (
    (await run(`DELETE FROM habits WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])) > 0
  );
}
