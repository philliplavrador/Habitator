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

// ── Fasting ─────────────────────────────────────────────────────────

export interface Fast {
  id: number;
  start_at: string; // ISO timestamp
  end_at: string | null; // ISO timestamp; null while in progress
  goal_hours: number; // target duration in hours
  note: string;
  created_at: string; // ISO timestamp
}

export interface FastStats {
  totalFasts: number; // completed fasts
  /** Mean length of completed fasts, in hours; null when there are none. */
  avgHours: number | null;
  /** Longest completed fast, in hours; null when there are none. */
  longestHours: number | null;
  totalHours: number; // summed length of completed fasts
  goalsHit: number; // completed fasts whose elapsed >= goal
}

/**
 * Input accepted when creating a fast.
 * - Live fast: send `goal_hours` (the target window length); `end_at` omitted.
 * - Logged fast: send `end_at` (an already-finished fast); `goal_hours` is
 *   derived from the start→end window.
 */
export interface StartFastInput {
  goal_hours?: number;
  start_at?: string; // defaults to now
  end_at?: string; // present → logging a completed fast
  note?: string;
}

/** Partial input accepted when editing/ending a fast. */
export interface UpdateFastInput {
  start_at?: string;
  end_at?: string | null;
  goal_hours?: number;
  note?: string;
}
