import { many, one, run } from './db';
import type { Entry, EntryStatus } from './types';

// Entries carry their own `user_id` (scoping every query directly). The
// (habit_id, date) uniqueness still guarantees one status per habit per day.
// Callers that accept an untrusted habitId MUST first confirm the habit belongs
// to the user (see the entries route) — this layer trusts its arguments.

/** The single entry for a (habit, date), or undefined when the day is blank. */
export async function getEntry(
  userId: number,
  habitId: number,
  date: string
): Promise<Entry | undefined> {
  return one<Entry>(
    `SELECT * FROM entries WHERE user_id = $1 AND habit_id = $2 AND date = $3`,
    [userId, habitId, date]
  );
}

/** All entries recorded on a given date (across the user's habits). */
export async function listEntriesForDate(
  userId: number,
  date: string
): Promise<Entry[]> {
  return many<Entry>(`SELECT * FROM entries WHERE user_id = $1 AND date = $2`, [
    userId,
    date,
  ]);
}

/** Map of habit_id → status for one date — handy for the Today screen. */
export async function statusMapForDate(
  userId: number,
  date: string
): Promise<Map<number, EntryStatus>> {
  const map = new Map<number, EntryStatus>();
  for (const e of await listEntriesForDate(userId, date)) {
    map.set(e.habit_id, e.status);
  }
  return map;
}

/** Every entry for a habit, ascending by date. */
export async function listEntriesForHabit(
  userId: number,
  habitId: number
): Promise<Entry[]> {
  return many<Entry>(
    `SELECT * FROM entries WHERE user_id = $1 AND habit_id = $2 ORDER BY date ASC`,
    [userId, habitId]
  );
}

/** Every entry across all the user's habits, ascending by date. */
export async function listAllEntries(userId: number): Promise<Entry[]> {
  return many<Entry>(
    `SELECT * FROM entries WHERE user_id = $1 ORDER BY date ASC`,
    [userId]
  );
}

/** Entries for a habit on/after `sinceDate`, ascending. */
export async function listEntriesForHabitSince(
  userId: number,
  habitId: number,
  sinceDate: string
): Promise<Entry[]> {
  return many<Entry>(
    `SELECT * FROM entries WHERE user_id = $1 AND habit_id = $2 AND date >= $3
     ORDER BY date ASC`,
    [userId, habitId, sinceDate]
  );
}

/** Set (create or overwrite) the pass/fail status for a (habit, date). */
export async function setEntry(
  userId: number,
  habitId: number,
  date: string,
  status: EntryStatus
): Promise<Entry> {
  await run(
    `INSERT INTO entries (user_id, habit_id, date, status, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (habit_id, date) DO UPDATE SET status = EXCLUDED.status`,
    [userId, habitId, date, status, new Date().toISOString()]
  );
  return (await getEntry(userId, habitId, date))!;
}

/** Clear a (habit, date) back to blank. Returns true if a row was removed. */
export async function clearEntry(
  userId: number,
  habitId: number,
  date: string
): Promise<boolean> {
  return (
    (await run(
      `DELETE FROM entries WHERE user_id = $1 AND habit_id = $2 AND date = $3`,
      [userId, habitId, date]
    )) > 0
  );
}
