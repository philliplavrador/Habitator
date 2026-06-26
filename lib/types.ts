// Shared domain types. Mirror the SQLite schema in lib/db.ts.

export type EntryStatus = 'pass' | 'fail';

export interface Habit {
  id: number;
  name: string;
  details: string;
  exceptions: string;
  start_date: string; // YYYY-MM-DD
  sort_order: number;
  archived: number; // 0 | 1 (SQLite has no boolean)
  created_at: string; // ISO timestamp
}

export interface Entry {
  id: number;
  habit_id: number;
  date: string; // YYYY-MM-DD
  status: EntryStatus;
  created_at: string; // ISO timestamp
}

export interface HabitStats {
  passes: number;
  fails: number;
  recorded: number; // passes + fails
  /** passes / recorded, in [0,1]; null when there are no recorded days. */
  completionRate: number | null;
  currentStreak: number;
  longestStreak: number;
}

/** A habit plus its status on a particular day — used by the Today screen. */
export interface HabitDayView {
  habit: Habit;
  status: EntryStatus | null;
  currentStreak: number;
}

/** Input accepted when creating/updating a habit. */
export interface HabitInput {
  name: string;
  details: string;
  exceptions: string;
  start_date: string;
}
