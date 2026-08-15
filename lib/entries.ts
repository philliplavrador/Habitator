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

/** Every entry across the user's habits within [start, end] (inclusive). */
export async function listEntriesForDateRange(
  userId: number,
  start: string,
  end: string
): Promise<Entry[]> {
  return many<Entry>(
    `SELECT * FROM entries WHERE user_id = $1 AND date >= $2 AND date <= $3`,
    [userId, start, end]
  );
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

/**
 * For each of `habitIds`, the latest date it was marked 'pass' on or before
 * `date` — or absent from the map when it never has been.
 *
 * This is what makes a rolling monthly habit work: its due-ness is "has anything
 * completed it since its anchor day", which no other schedule kind needs. One
 * grouped query for the whole screen rather than one per habit, and it's only
 * called when the user actually has monthly habits.
 */
export async function lastPassByHabit(
  userId: number,
  habitIds: number[],
  date: string
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (habitIds.length === 0) return out;
  const rows = await many<{ habit_id: number; last_pass: string }>(
    `SELECT habit_id, MAX(date) AS last_pass
       FROM entries
      WHERE user_id = $1 AND habit_id = ANY($2) AND status = 'pass' AND date <= $3
      GROUP BY habit_id`,
    [userId, habitIds, date]
  );
  for (const r of rows) {
    if (r.last_pass) out.set(r.habit_id, r.last_pass);
  }
  return out;
}

/** Set (create or overwrite) the pass/fail status for a (habit, date). */
export async function setEntry(
  userId: number,
  habitId: number,
  date: string,
  status: EntryStatus
): Promise<Entry> {
  // Single round-trip: the upsert RETURNs the resulting row (no follow-up
  // SELECT). Conflict target stays (habit_id, date) — global per habit/day, not
  // user-scoped — and created_at is only set on the initial insert (the DO
  // UPDATE touches status alone, preserving the original created_at).
  return (await one<Entry>(
    `INSERT INTO entries (user_id, habit_id, date, status, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (habit_id, date) DO UPDATE SET status = EXCLUDED.status
     RETURNING *`,
    [userId, habitId, date, status, new Date().toISOString()]
  ))!;
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
