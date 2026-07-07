import { getHabit } from './habits';
import { listEntriesForHabitSince } from './entries';
import { many } from './db';
import type { Entry, Habit, HabitStats } from './types';

/**
 * Stats rules (mirror the owner's spreadsheet exactly):
 *
 * Consider only entries with `date >= habit.start_date`, ordered ascending.
 * "Recorded days" are days that have a pass/fail row. Blank days (no row) are
 * exceptions — they are skipped entirely: they neither hurt the win rate nor
 * break/extend a streak.
 *
 *  • Completion %   = passes / (passes + fails) over recorded days; null if none.
 *  • Longest streak = longest run of consecutive `pass` recorded days. A `fail`
 *                     breaks the run; blanks aren't in the list so they're skipped.
 *  • Current streak = walking back from the most recent recorded day, the count
 *                     of consecutive `pass` days until a `fail` is hit. If the
 *                     most recent recorded day is a `fail`, current streak = 0.
 */
export function computeStats(entries: Entry[]): HabitStats {
  let passes = 0;
  let fails = 0;
  let longestStreak = 0;
  let run = 0;

  for (const e of entries) {
    if (e.status === 'pass') {
      passes++;
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      fails++;
      run = 0;
    }
  }

  const recorded = passes + fails;

  let currentStreak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].status === 'pass') currentStreak++;
    else break;
  }

  return {
    passes,
    fails,
    recorded,
    completionRate: recorded === 0 ? null : passes / recorded,
    currentStreak,
    longestStreak,
  };
}

/** Load a habit's qualifying entries and compute its stats. */
export async function getHabitStats(
  userId: number,
  habitId: number
): Promise<HabitStats> {
  const habit = await getHabit(userId, habitId);
  if (!habit) {
    return {
      passes: 0,
      fails: 0,
      recorded: 0,
      completionRate: null,
      currentStreak: 0,
      longestStreak: 0,
    };
  }
  const entries = await listEntriesForHabitSince(
    userId,
    habitId,
    habit.start_date
  );
  return computeStats(entries);
}

/** Just the current streak — used for the small Today-screen badge. */
export async function getCurrentStreak(
  userId: number,
  habitId: number
): Promise<number> {
  return (await getHabitStats(userId, habitId)).currentStreak;
}

// ── Batched equivalents (Today / Insights) ──────────────────────────
//
// getHabitStatsBatch / getCurrentStreaksBatch are the BATCHED equivalents of
// getHabitStats / getCurrentStreak: they replace the N+1 per-habit round-trips
// with ONE user-scoped query, then run the SAME pure computeStats logic on each
// habit's in-memory entries. They MUST stay in sync with the single-habit
// functions above — the numbers are required to be identical.

/**
 * Load stats for many habits in a single query, keyed by habit id.
 *
 * One `SELECT ... WHERE user_id = $1 AND habit_id = ANY($2)` (still user-scoped)
 * replaces one query per habit. Entries are grouped by habit_id in memory and
 * each group is filtered to `date >= habit.start_date` (matching the per-habit
 * `listEntriesForHabitSince` query), then fed to the existing `computeStats`.
 * Result is numerically identical to calling getHabitStats(userId, habit) for
 * each habit.
 */
export async function getHabitStatsBatch(
  userId: number,
  habits: Habit[]
): Promise<Map<number, HabitStats>> {
  const stats = new Map<number, HabitStats>();
  if (habits.length === 0) return stats;

  const ids = habits.map((h) => h.id);
  // ORDER BY habit_id, date so each group already arrives ascending by date,
  // which is the order computeStats/currentStreak assume.
  const rows = await many<Entry & { user_id: number }>(
    `SELECT * FROM entries WHERE user_id = $1 AND habit_id = ANY($2)
     ORDER BY habit_id, date ASC`,
    [userId, ids]
  );

  const byHabit = new Map<number, Entry[]>();
  for (const row of rows) {
    const list = byHabit.get(row.habit_id);
    if (list) list.push(row);
    else byHabit.set(row.habit_id, [row]);
  }

  for (const habit of habits) {
    const entries = (byHabit.get(habit.id) ?? []).filter(
      (e) => e.date >= habit.start_date
    );
    stats.set(habit.id, computeStats(entries));
  }
  return stats;
}

/**
 * Current streak for many habits in a single query, keyed by habit id. Batched
 * equivalent of getCurrentStreak — reuses the same computeStats streak logic via
 * getHabitStatsBatch so the value can't drift from the single-habit version.
 */
export async function getCurrentStreaksBatch(
  userId: number,
  habits: Habit[]
): Promise<Map<number, number>> {
  const stats = await getHabitStatsBatch(userId, habits);
  const streaks = new Map<number, number>();
  for (const habit of habits) {
    streaks.set(habit.id, stats.get(habit.id)?.currentStreak ?? 0);
  }
  return streaks;
}

/** Format a completion rate (0..1 or null) as a display string. */
export function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}
