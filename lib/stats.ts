import { getHabit } from './habits';
import { listEntriesForHabitSince } from './entries';
import { listExceptionSet, listExceptionSetsForRefs } from './exceptions';
import { many } from './db';
import { addDays, compareISO, rangeDates } from './dates';
import { isDueOn, weekStartOf } from './schedule';
import type { Entry, EntryStatus, Habit, HabitStats, Schedule } from './types';

/** Shared empty set so exception-unaware callers allocate nothing. */
const NO_EXCEPTIONS: ReadonlySet<string> = new Set<string>();

/**
 * Stats rules for a `build` habit (mirror the owner's spreadsheet exactly):
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
 *
 * A user-marked exception (rest day) drops that date's entry from the list
 * entirely, so an excepted `fail` no longer breaks or counts — it behaves like a
 * blank day.
 */
export function computeStats(
  entries: Entry[],
  exceptions: ReadonlySet<string> = NO_EXCEPTIONS
): HabitStats {
  let passes = 0;
  let fails = 0;
  let longestStreak = 0;
  let run = 0;

  if (exceptions.size > 0) {
    entries = entries.filter((e) => !exceptions.has(e.date));
  }

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

const ZERO_STATS: HabitStats = {
  passes: 0,
  fails: 0,
  recorded: 0,
  completionRate: null,
  currentStreak: 0,
  longestStreak: 0,
};

/**
 * Stats rules for a `quit` habit — the inverse of a build habit. Every calendar
 * day from `start_date` through `today` counts: a day is a SLIP only if it has
 * an explicit `fail` entry, otherwise it's CLEAN (blank in-range days are wins,
 * not exceptions). This is a calendar-day walk (deliberately unlike the
 * list-position walk of `computeStats`; see the streak note in lib/CLAUDE.md).
 *
 *  • `passes` = clean days, `fails` = slips, over every elapsed day.
 *  • Completion % = clean days / elapsed days; null before the habit starts.
 *  • Current streak = the run of clean days ending today (0 if today is a slip).
 *  • Longest streak = the longest run of consecutive clean days.
 */
export function computeQuitStats(
  entries: Entry[],
  startDate: string,
  today: string,
  exceptions: ReadonlySet<string> = NO_EXCEPTIONS
): HabitStats {
  // Only explicit slips ('fail') are recorded for a quit habit; a stray 'pass'
  // (shouldn't occur) is treated as clean, i.e. not a slip.
  const slipDays = new Set<string>();
  for (const e of entries) {
    if (e.status === 'fail') slipDays.add(e.date);
  }

  // Habit hasn't started yet → no elapsed days to score.
  if (compareISO(startDate, today) > 0) return { ...ZERO_STATS };

  let cleanDays = 0;
  let slips = 0;
  let longestStreak = 0;
  let run = 0;
  for (const d of rangeDates(startDate, today)) {
    // An excepted day is skipped entirely — neither a clean win nor a slip — so
    // a slip you excused doesn't break the clean streak and the run bridges it.
    if (exceptions.has(d)) continue;
    if (slipDays.has(d)) {
      slips++;
      run = 0;
    } else {
      cleanDays++;
      run++;
      if (run > longestStreak) longestStreak = run;
    }
  }
  // The loop ends on `today`, so the trailing `run` IS the current clean streak.
  const recorded = cleanDays + slips;
  return {
    passes: cleanDays,
    fails: slips,
    recorded,
    completionRate: recorded === 0 ? null : cleanDays / recorded,
    currentStreak: run,
    longestStreak,
  };
}

/**
 * Stats rules for a STRICT scheduled build habit (`weekdays` / `interval`).
 * Unlike a daily build habit, a due day you don't complete is a MISS, not an
 * exception — the whole point of a schedule is accountability on its days.
 *
 * Walk only the schedule's DUE days in [start_date, today]:
 *  • pass day (entry `pass`)                → success, extends the streak.
 *  • miss day (blank OR explicit `fail`)    → breaks the streak.
 *  • EXCEPTION: today, if it's due and still blank, is PENDING — not yet a miss
 *    (the day isn't over), so it neither counts nor breaks the trailing streak.
 * Non-due days are ignored entirely (they never show and never count).
 */
export function computeScheduledStats(
  entries: Entry[],
  schedule: Schedule,
  startDate: string,
  today: string,
  exceptions: ReadonlySet<string> = NO_EXCEPTIONS
): HabitStats {
  if (compareISO(startDate, today) > 0) return { ...ZERO_STATS };

  const statusByDate = new Map<string, EntryStatus>();
  for (const e of entries) statusByDate.set(e.date, e.status);

  let passes = 0;
  let fails = 0;
  let longestStreak = 0;
  let run = 0;
  for (const d of rangeDates(startDate, today)) {
    if (!isDueOn(schedule, startDate, d)) continue;
    // A user-marked exception makes a due day behave like an off day — skipped,
    // so a missed rest day neither counts as a miss nor breaks the streak.
    if (exceptions.has(d)) continue;
    const st = statusByDate.get(d);
    if (st === 'pass') {
      passes++;
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      // Today, still blank → pending: the day isn't over, so don't penalize it
      // (leaves the trailing `run` intact as the current streak).
      if (d === today && st === undefined) continue;
      fails++;
      run = 0;
    }
  }
  const recorded = passes + fails;
  return {
    passes,
    fails,
    recorded,
    completionRate: recorded === 0 ? null : passes / recorded,
    currentStreak: run,
    longestStreak,
  };
}

/**
 * Stats rules for a `weekly` habit — a target of N completions per calendar week
 * (Sun-based). Accountability is at WEEK granularity: `passes`/`fails`/streaks
 * are counted in weeks, not days.
 *
 *  • A completed past week counts as a pass if it had >= N `pass` entries, else
 *    a miss (breaking the streak).
 *  • The current week counts as a pass only once it has already hit N; until
 *    then it's PENDING (not a miss — the week isn't over).
 *  • The first partial week (habit started mid-week) is skipped so a short week
 *    can't be an unfair miss; eligible weeks start at the first Sunday >= start.
 *  • Each exception (rest day) in a week lowers that week's required count by one
 *    (a week you excused every day of is skipped entirely, like the first partial
 *    week), so a missed day doesn't cost you the week.
 */
export function computeWeeklyStats(
  entries: Entry[],
  count: number,
  startDate: string,
  today: string,
  exceptions: ReadonlySet<string> = NO_EXCEPTIONS
): HabitStats {
  if (compareISO(startDate, today) > 0) return { ...ZERO_STATS };

  const perWeek = new Map<string, number>();
  for (const e of entries) {
    if (e.status !== 'pass') continue;
    if (compareISO(e.date, startDate) < 0) continue;
    const wk = weekStartOf(e.date);
    perWeek.set(wk, (perWeek.get(wk) ?? 0) + 1);
  }

  // Exceptions per week: each one shaves a completion off that week's target.
  const excPerWeek = new Map<string, number>();
  for (const d of exceptions) {
    if (compareISO(d, startDate) < 0) continue;
    const wk = weekStartOf(d);
    excPerWeek.set(wk, (excPerWeek.get(wk) ?? 0) + 1);
  }

  const currentWeek = weekStartOf(today);
  // First eligible (full) week: the first Sunday on/after start_date.
  let wk = weekStartOf(startDate);
  if (compareISO(wk, startDate) < 0) wk = addDays(wk, 7);

  let passes = 0;
  let fails = 0;
  let longestStreak = 0;
  let run = 0;
  while (compareISO(wk, currentWeek) <= 0) {
    const target = count - (excPerWeek.get(wk) ?? 0);
    if (target <= 0) {
      // Every scheduled day that week was excused → treat the week as neutral
      // (neither a pass nor a miss), so it doesn't break the streak.
      wk = addDays(wk, 7);
      continue;
    }
    const met = (perWeek.get(wk) ?? 0) >= target;
    if (wk === currentWeek && !met) {
      // Current week not yet hit → pending: leave the trailing streak intact.
      break;
    }
    if (met) {
      passes++;
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      fails++;
      run = 0;
    }
    wk = addDays(wk, 7);
  }
  const recorded = passes + fails;
  return {
    passes,
    fails,
    recorded,
    completionRate: recorded === 0 ? null : passes / recorded,
    currentStreak: run,
    longestStreak,
  };
}

/**
 * Dispatch to the right stats rules for the habit's kind + schedule.
 *
 * A habit with an `end_date` is scored only through that day — its stats FREEZE
 * at the end. We do this uniformly, independent of kind: (1) clamp the effective
 * "today" the calendar-walking rules use to the end date, so their walks stop
 * there (the end day itself is treated like a live day — lenient, matching the
 * "first partial week is skipped" and "today is pending" rules); and (2) window
 * the recorded entries to on/before the end date, so a stray row after it (e.g.
 * left over from before the end date was set) never counts. A future end_date is
 * a no-op (effectiveToday stays today; nothing is after it yet).
 */
export function computeHabitStats(
  habit: Habit,
  entries: Entry[],
  today: string,
  exceptions: ReadonlySet<string> = NO_EXCEPTIONS
): HabitStats {
  const end = habit.end_date;
  const effectiveToday = end !== null && compareISO(end, today) < 0 ? end : today;
  const windowed =
    end !== null ? entries.filter((e) => compareISO(e.date, end) <= 0) : entries;

  if (habit.kind === 'quit') {
    return computeQuitStats(windowed, habit.start_date, effectiveToday, exceptions);
  }
  switch (habit.schedule.kind) {
    case 'weekdays':
    case 'interval':
      return computeScheduledStats(
        windowed,
        habit.schedule,
        habit.start_date,
        effectiveToday,
        exceptions
      );
    case 'weekly':
      return computeWeeklyStats(
        windowed,
        habit.schedule.count,
        habit.start_date,
        effectiveToday,
        exceptions
      );
    default:
      return computeStats(windowed, exceptions);
  }
}

/**
 * Load a habit's qualifying entries and compute its stats. `today` (owner-tz
 * local day) is required because `quit` habits score against the calendar.
 */
export async function getHabitStats(
  userId: number,
  habitId: number,
  today: string
): Promise<HabitStats> {
  const habit = await getHabit(userId, habitId);
  if (!habit) return { ...ZERO_STATS };
  const [entries, exceptions] = await Promise.all([
    listEntriesForHabitSince(userId, habitId, habit.start_date),
    listExceptionSet(userId, 'habit', String(habitId)),
  ]);
  return computeHabitStats(habit, entries, today, exceptions);
}

/** Just the current streak — used for the small Today-screen badge. */
export async function getCurrentStreak(
  userId: number,
  habitId: number,
  today: string
): Promise<number> {
  return (await getHabitStats(userId, habitId, today)).currentStreak;
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
  habits: Habit[],
  today: string
): Promise<Map<number, HabitStats>> {
  const stats = new Map<number, HabitStats>();
  if (habits.length === 0) return stats;

  const ids = habits.map((h) => h.id);
  // ORDER BY habit_id, date so each group already arrives ascending by date,
  // which is the order computeStats/currentStreak assume. Exceptions load in the
  // same wave, one query for all habits (batched like the entries read).
  const [rows, excByRef] = await Promise.all([
    many<Entry & { user_id: number }>(
      `SELECT * FROM entries WHERE user_id = $1 AND habit_id = ANY($2)
       ORDER BY habit_id, date ASC`,
      [userId, ids]
    ),
    listExceptionSetsForRefs(userId, 'habit', ids.map(String)),
  ]);

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
    const exceptions = excByRef.get(String(habit.id)) ?? NO_EXCEPTIONS;
    stats.set(habit.id, computeHabitStats(habit, entries, today, exceptions));
  }
  return stats;
}

/**
 * Current streak for many habits in a single query, keyed by habit id. Batched
 * equivalent of getCurrentStreak — reuses the same computeHabitStats logic via
 * getHabitStatsBatch so the value can't drift from the single-habit version.
 */
export async function getCurrentStreaksBatch(
  userId: number,
  habits: Habit[],
  today: string
): Promise<Map<number, number>> {
  const stats = await getHabitStatsBatch(userId, habits, today);
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
