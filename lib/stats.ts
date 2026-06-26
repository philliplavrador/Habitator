import { getHabit } from './habits';
import { listEntriesForHabitSince } from './entries';
import type { Entry, HabitStats } from './types';

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
export function getHabitStats(habitId: number): HabitStats {
  const habit = getHabit(habitId);
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
  const entries = listEntriesForHabitSince(habitId, habit.start_date);
  return computeStats(entries);
}

/** Just the current streak — used for the small Today-screen badge. */
export function getCurrentStreak(habitId: number): number {
  return getHabitStats(habitId).currentStreak;
}

/** Format a completion rate (0..1 or null) as a display string. */
export function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}
