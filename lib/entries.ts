import { db } from './db';
import type { Entry, EntryStatus } from './types';

const stmtGet = db.prepare<[number, string]>(
  `SELECT * FROM entries WHERE habit_id = ? AND date = ?`
);
const stmtForDate = db.prepare<[string]>(
  `SELECT * FROM entries WHERE date = ?`
);
const stmtForHabit = db.prepare<[number]>(
  `SELECT * FROM entries WHERE habit_id = ? ORDER BY date ASC`
);
const stmtAll = db.prepare<[]>(`SELECT * FROM entries ORDER BY date ASC`);
const stmtForHabitSince = db.prepare<[number, string]>(
  `SELECT * FROM entries WHERE habit_id = ? AND date >= ? ORDER BY date ASC`
);
// Insert-or-replace the status for a (habit, date). UNIQUE(habit_id,date) makes
// this an idempotent upsert.
const stmtUpsert = db.prepare(
  `INSERT INTO entries (habit_id, date, status, created_at)
   VALUES (@habit_id, @date, @status, @created_at)
   ON CONFLICT (habit_id, date)
   DO UPDATE SET status = excluded.status`
);
const stmtClear = db.prepare<[number, string]>(
  `DELETE FROM entries WHERE habit_id = ? AND date = ?`
);

/** The single entry for a (habit, date), or undefined when the day is blank. */
export function getEntry(habitId: number, date: string): Entry | undefined {
  return stmtGet.get(habitId, date) as Entry | undefined;
}

/** All entries recorded on a given date (across habits). */
export function listEntriesForDate(date: string): Entry[] {
  return stmtForDate.all(date) as Entry[];
}

/** Map of habit_id → status for one date — handy for the Today screen. */
export function statusMapForDate(date: string): Map<number, EntryStatus> {
  const map = new Map<number, EntryStatus>();
  for (const e of listEntriesForDate(date)) map.set(e.habit_id, e.status);
  return map;
}

/** Every entry for a habit, ascending by date. */
export function listEntriesForHabit(habitId: number): Entry[] {
  return stmtForHabit.all(habitId) as Entry[];
}

/** Every entry across all habits, ascending by date. For cross-habit analytics. */
export function listAllEntries(): Entry[] {
  return stmtAll.all() as Entry[];
}

/** Entries for a habit on/after `sinceDate`, ascending. */
export function listEntriesForHabitSince(habitId: number, sinceDate: string): Entry[] {
  return stmtForHabitSince.all(habitId, sinceDate) as Entry[];
}

/** Set (create or overwrite) the pass/fail status for a (habit, date). */
export function setEntry(habitId: number, date: string, status: EntryStatus): Entry {
  stmtUpsert.run({
    habit_id: habitId,
    date,
    status,
    created_at: new Date().toISOString(),
  });
  return getEntry(habitId, date)!;
}

/** Clear a (habit, date) back to blank. Returns true if a row was removed. */
export function clearEntry(habitId: number, date: string): boolean {
  return stmtClear.run(habitId, date).changes > 0;
}
