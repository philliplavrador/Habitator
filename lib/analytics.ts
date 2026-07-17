// Server-side analytics: pure functions over the domain rows (from the lib/*
// query helpers) that produce plain, serializable data for the chart client
// components. No DB access here — callers pass the rows in. Reuses lib/dates
// so day/week math and timezone handling stay consistent with the rest of the app.
//
// Rate-scale contract: this module emits completion rates as 0..100 percents
// (see RatePoint / WeekdayPoint), whereas lib/stats.ts emits 0..1 fractions.
// Keep that boundary in mind when moving values between the two.

import {
  addDays,
  compareISO,
  hoursBetween,
  rangeDates,
  toLocalInputValue,
  weekdayOf,
} from './dates';
import type {
  AnkiDay,
  Entry,
  Fast,
  Habit,
  PlankSession,
  PushupSession,
  RepDayStatus,
  RepSession,
} from './types';

/** Shared empty exception set so exception-unaware callers allocate nothing. */
const EMPTY_DATE_SET: ReadonlySet<string> = new Set<string>();

// ── Habits ──────────────────────────────────────────────────────────

export interface RatePoint {
  date: string;
  rate: number | null; // percent 0..100
}

/**
 * Windowed completion-rate trend, sampled at each recorded day. At each recorded
 * (pass/fail) entry, `rate` = passes / recorded over the trailing `windowDays`
 * calendar days. Blanks aren't in `entries`, so they neither count nor break —
 * mirroring the stats rules. `entries` must be ascending by date and already
 * filtered to date >= start_date.
 */
export function rollingCompletionSeries(
  entries: Entry[],
  windowDays: number
): RatePoint[] {
  const out: RatePoint[] = [];
  const win: { date: string; pass: boolean }[] = [];
  for (const e of entries) {
    win.push({ date: e.date, pass: e.status === 'pass' });
    const cutoff = addDays(e.date, -(windowDays - 1));
    while (win.length && compareISO(win[0].date, cutoff) < 0) win.shift();
    const passes = win.reduce((n, w) => n + (w.pass ? 1 : 0), 0);
    out.push({ date: e.date, rate: win.length ? Math.round((passes / win.length) * 100) : null });
  }
  return out;
}

export interface WeekdayPoint {
  weekday: number; // 0=Sun … 6=Sat
  label: string;
  passes: number;
  fails: number;
  rate: number | null; // percent
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Pass/fail counts and win rate bucketed by day of week. */
export function dayOfWeekBreakdown(entries: Entry[]): WeekdayPoint[] {
  const acc = Array.from({ length: 7 }, () => ({ passes: 0, fails: 0 }));
  for (const e of entries) {
    const d = weekdayOf(e.date);
    if (e.status === 'pass') acc[d].passes++;
    else acc[d].fails++;
  }
  return acc.map((a, weekday) => {
    const recorded = a.passes + a.fails;
    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      passes: a.passes,
      fails: a.fails,
      rate: recorded ? Math.round((a.passes / recorded) * 100) : null,
    };
  });
}

export interface CumulativePoint {
  date: string;
  total: number;
}

/** Running total of passes over time (ascending entries). */
export function cumulativePasses(entries: Entry[]): CumulativePoint[] {
  let total = 0;
  const out: CumulativePoint[] = [];
  for (const e of entries) {
    if (e.status === 'pass') total++;
    out.push({ date: e.date, total });
  }
  return out;
}

export interface PerfectDays {
  dates: string[];
  count: number;
}

/**
 * Days on which every habit active that day (start_date <= day <= end_date) was
 * "won": a `build` habit must be marked `pass` (a blank or fail disqualifies),
 * and a `quit` habit must simply NOT have a slip that day (blank = clean = fine).
 * Only days with at least one entry can qualify. Uses the start/end window (not
 * archived) so historical perfect days stand and an ended habit stops being
 * required after its end date.
 */
export function perfectDays(
  habits: Habit[],
  allEntries: Entry[],
  today: string
): PerfectDays {
  const byDate = new Map<string, Map<number, Entry['status']>>();
  for (const e of allEntries) {
    let m = byDate.get(e.date);
    if (!m) {
      m = new Map();
      byDate.set(e.date, m);
    }
    m.set(e.habit_id, e.status);
  }
  const dates: string[] = [];
  for (const [date, statuses] of byDate) {
    if (compareISO(date, today) > 0) continue;
    const active = habits.filter(
      (h) =>
        compareISO(h.start_date, date) <= 0 &&
        (h.end_date === null || compareISO(date, h.end_date) <= 0)
    );
    if (active.length === 0) continue;
    const allWon = active.every((h) =>
      h.kind === 'quit'
        ? statuses.get(h.id) !== 'fail'
        : statuses.get(h.id) === 'pass'
    );
    if (allWon) dates.push(date);
  }
  dates.sort();
  return { dates, count: dates.length };
}

// ── Fasts ───────────────────────────────────────────────────────────

function completedFasts(fasts: Fast[]): Fast[] {
  return fasts
    .filter((f) => f.end_at !== null)
    .sort((a, b) => compareISO(a.start_at, b.start_at));
}

export interface CompletedFast {
  fast: Fast;
  hours: number; // exact fractional length (unrounded hoursBetween)
  localStart: string; // start_at as local wall-clock (YYYY-MM-DDTHH:mm); '' when tz omitted
  hit: boolean; // hours >= goal_hours
}

/**
 * The shared "which fasts are done, how long, did they hit goal" derivation:
 * completed fasts (end_at set) in chronological order, each with its exact
 * hours, local start wall-clock, and goal-hit flag. Feeds every fast aggregate
 * below and lib/fastStats so the completed/hours/hit logic lives in one place.
 * `tz` is only needed for `localStart`; callers that don't read it can omit it.
 */
export function completedFastHours(fasts: Fast[], tz?: string): CompletedFast[] {
  return completedFasts(fasts).map((f) => {
    const hours = hoursBetween(f.start_at, f.end_at as string);
    return {
      fast: f,
      hours,
      localStart: tz ? toLocalInputValue(f.start_at, tz) : '',
      hit: hours >= f.goal_hours,
    };
  });
}

export interface FastDurationPoint {
  start_at: string;
  label: string; // short date label for the axis
  hours: number;
  goal_hours: number;
  hit: boolean;
}

/** One point per completed fast, chronological. */
export function fastDurationSeries(fasts: Fast[], tz: string): FastDurationPoint[] {
  return completedFastHours(fasts, tz).map(({ fast, hours, localStart, hit }) => ({
    start_at: fast.start_at,
    label: localStart.slice(5, 10), // MM-DD
    hours: Math.round(hours * 10) / 10,
    goal_hours: fast.goal_hours,
    hit,
  }));
}

export interface HistogramBin {
  label: string;
  from: number;
  to: number;
  count: number;
}

/** Bucket completed-fast durations into fixed-width bins. */
export function durationHistogram(fasts: Fast[], binHours = 4): HistogramBin[] {
  const hours = completedFastHours(fasts).map((c) => c.hours);
  if (hours.length === 0) return [];
  const max = Math.max(...hours);
  const bins: HistogramBin[] = [];
  for (let from = 0; from <= max; from += binHours) {
    const to = from + binHours;
    const count = hours.filter((h) => h >= from && h < to).length;
    bins.push({ label: `${from}–${to}h`, from, to, count });
  }
  return bins;
}

export interface HourPoint {
  hour: number;
  label: string;
  count: number;
}

/** How many fasts started in each local hour of day (0..23). */
export function startHourDistribution(fasts: Fast[], tz: string): HourPoint[] {
  const counts = new Array(24).fill(0);
  for (const { localStart } of completedFastHours(fasts, tz)) {
    const h = Number(localStart.slice(11, 13));
    if (h >= 0 && h < 24) counts[h]++;
  }
  return counts.map((count, hour) => ({
    hour,
    label: `${((hour + 11) % 12) + 1}${hour < 12 ? 'a' : 'p'}`,
    count,
  }));
}

export interface StreakStat {
  current: number;
  longest: number;
}

/**
 * Shared calendar-day streak walk over the DISTINCT set of covered local days:
 * returns the longest consecutive run ever, plus the current run ending today
 * (or yesterday when today isn't covered yet, so an in-progress day never reads
 * as broken). Order-independent. Both attemptStreak (session days) and
 * consecutiveFastingStreak (fast-covered days) build a Set and delegate here;
 * this is deliberately NOT the same as stats.computeStats (list-position) or
 * anki.computeStreak (daily-minimum + today-grace) semantics.
 */
function streakOverDays(
  days: Set<string>,
  today: string,
  exceptions: ReadonlySet<string> = EMPTY_DATE_SET
): StreakStat {
  // A user-marked exception (rest day) is transparent: it bridges a gap between
  // covered days without counting toward the run length. Walk over the union of
  // covered + excepted dates, but only tally the covered ones.
  const covered = (d: string) => days.has(d) || exceptions.has(d);

  // Longest run across all covered days, bridging over excepted days.
  const sorted = [...new Set([...days, ...exceptions])].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    const consecutive = prev !== null && addDays(prev, 1) === d;
    run = consecutive ? run : 0;
    if (days.has(d)) run++; // excepted-only days extend the block but not the count
    if (run > longest) longest = run;
    prev = d;
  }
  // Current run ending today (or yesterday, so an unbroken habit shows through).
  // A rest day today (or yesterday) keeps the run alive as the anchor.
  let current = 0;
  let cursor = covered(today) ? today : addDays(today, -1);
  while (covered(cursor)) {
    if (days.has(cursor)) current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/** Consecutive local days covered by any completed fast (current run to today, and longest). */
export function consecutiveFastingStreak(
  fasts: Fast[],
  tz: string,
  today: string
): StreakStat {
  const days = new Set<string>();
  for (const f of completedFasts(fasts)) {
    const startDay = toLocalInputValue(f.start_at, tz).slice(0, 10);
    const endDay = toLocalInputValue(f.end_at as string, tz).slice(0, 10);
    for (const d of rangeDates(startDay, endDay)) days.add(d);
  }
  return streakOverDays(days, today);
}

// ── Rep programs (pushups / pullups) ────────────────────────────────

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Attempt streak for a rep program: consecutive local days that have at least
 * one logged session (pass OR fail). `dates` is the DISTINCT set of session
 * dates (order-independent). Only a fully skipped day breaks the run; a `today`
 * with no attempt yet does not — the current run is anchored at today if it has
 * an attempt, else at yesterday (so an in-progress day never reads as broken).
 * A user-marked exception (rest day) bridges a skipped day without counting.
 */
export function attemptStreak(
  dates: string[],
  today: string,
  exceptions: ReadonlySet<string> = EMPTY_DATE_SET
): StreakStat {
  return streakOverDays(new Set(dates), today, exceptions);
}

/**
 * Per-day outcome for the session heatmap: 'complete' when any session that day
 * met every set, else 'attempted' (tried but fell short). Days with no session
 * are simply absent — the heatmap renders those as "skipped". `startDate` is the
 * earliest session date (null when there are no sessions). `sessions` may be in
 * any order. Structural over `{ date, completed }`, so both rep and plank
 * sessions feed it.
 */
export function sessionHeatmap(
  sessions: Array<{ date: string; completed: boolean }>
): {
  statusByDate: Record<string, RepDayStatus>;
  startDate: string | null;
} {
  const statusByDate: Record<string, RepDayStatus> = {};
  let startDate: string | null = null;
  for (const s of sessions) {
    if (startDate === null || compareISO(s.date, startDate) < 0) {
      startDate = s.date;
    }
    if (s.completed) statusByDate[s.date] = 'complete';
    else if (statusByDate[s.date] !== 'complete') {
      statusByDate[s.date] = 'attempted';
    }
  }
  return { statusByDate, startDate };
}

export interface RepVolumePoint {
  n: number; // session ordinal (1-based, chronological)
  date: string;
  volume: number;
  target: number;
  completed: boolean;
}

/** Total reps per session over time (chronological). `sessions` is newest-first. */
export function repVolumeSeries(sessions: PushupSession[]): RepVolumePoint[] {
  const chrono = [...sessions].reverse();
  return chrono.map((s, i) => ({
    n: i + 1,
    date: s.date,
    volume: sum(s.reps),
    target: sum(s.target),
    completed: s.completed,
  }));
}

export interface CompletionPoint {
  n: number;
  date: string;
  completed: number; // cumulative days completed
}

/** Cumulative days completed over the session log (chronological). Structural
 *  over `{ date, completed }`, so both rep and plank sessions feed it. */
export function completionTimeline(
  sessions: Array<{ date: string; completed: boolean }>
): CompletionPoint[] {
  const chrono = [...sessions].reverse();
  let completed = 0;
  return chrono.map((s, i) => {
    if (s.completed) completed++;
    return { n: i + 1, date: s.date, completed };
  });
}

export interface Projection {
  etaDate: string | null;
  perDay: number; // completed days per calendar day
  daysToGo: number | null;
}

/**
 * Estimated finish date at the current pace: completedCount / calendar days
 * elapsed since the first session. Null when there's no basis to project yet.
 */
export function projectedFinish(
  completedCount: number,
  programDays: number,
  sessions: Array<{ date: string }>,
  today: string
): Projection {
  if (completedCount <= 0 || sessions.length === 0) {
    return { etaDate: null, perDay: 0, daysToGo: null };
  }
  const earliest = sessions.reduce(
    (min, s) => (compareISO(s.date, min) < 0 ? s.date : min),
    today
  );
  const daysElapsed = Math.max(1, rangeDates(earliest, today).length);
  const perDay = completedCount / daysElapsed;
  if (perDay <= 0 || completedCount >= programDays) {
    return { etaDate: null, perDay, daysToGo: null };
  }
  const remaining = programDays - completedCount;
  const daysToGo = Math.ceil(remaining / perDay);
  return { etaDate: addDays(today, daysToGo), perDay, daysToGo };
}

// ── Plank programs ──────────────────────────────────────────────────

export interface PlankHoldPoint {
  n: number; // session ordinal (1-based, chronological)
  date: string;
  held: number; // seconds held
  target: number; // seconds prescribed
  completed: boolean;
}

/** Seconds held per session over time (chronological). `sessions` is newest-first. */
export function plankHoldSeries(sessions: PlankSession[]): PlankHoldPoint[] {
  const chrono = [...sessions].reverse();
  return chrono.map((s, i) => ({
    n: i + 1,
    date: s.date,
    held: s.lasted_seconds,
    target: s.target_seconds,
    completed: s.completed,
  }));
}

// ── Anki — Core 2k/6k Japanese deck ─────────────────────────────────

export interface AnkiCumPoint {
  date: string;
  label: string; // MM-DD for the axis
  done: number; // cumulative new cards done
  pace: number; // dailyMin * dayNumber — the min-pace reference (capped at goal)
}

/**
 * Per-calendar-day cumulative cards vs the min-pace reference line, from the
 * start date through max(today, last logged day). Days without a log carry the
 * previous cumulative forward, so the gap between "you" and "pace" reads
 * correctly even across skipped days. `days` may be in any order.
 */
export function ankiCumulativeSeries(
  days: AnkiDay[],
  startDate: string,
  today: string,
  dailyMin: number,
  goal: number
): AnkiCumPoint[] {
  const byDate = new Map<string, number>();
  let last = startDate;
  for (const d of days) {
    byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.new_cards);
    if (compareISO(d.date, last) > 0) last = d.date;
  }
  const end = compareISO(today, last) > 0 ? today : last;
  if (compareISO(startDate, end) > 0) return [];

  const out: AnkiCumPoint[] = [];
  let cum = 0;
  let dayNumber = 0;
  for (const date of rangeDates(startDate, end)) {
    dayNumber++;
    cum += byDate.get(date) ?? 0;
    out.push({
      date,
      label: date.slice(5),
      done: cum,
      pace: Math.min(goal, dailyMin * dayNumber),
    });
  }
  return out;
}
