// Server-side analytics: pure functions over the domain rows (from the lib/*
// query helpers) that produce plain, serializable data for the chart client
// components. No DB access here — callers pass the rows in. Reuses lib/dates
// so day/week math and timezone handling stay consistent with the rest of the app.

import {
  addDays,
  compareISO,
  hoursBetween,
  rangeDates,
  toLocalInputValue,
  weekdayOf,
} from './dates';
import type { Entry, Fast, Habit, PushupSession } from './types';

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
 * Days on which every habit active that day (start_date <= day) was marked
 * pass. A blank or fail disqualifies the day. Only days with at least one entry
 * can qualify. Uses start_date (not archived) so historical perfect days stand.
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
    const active = habits.filter((h) => compareISO(h.start_date, date) <= 0);
    if (active.length === 0) continue;
    if (active.every((h) => statuses.get(h.id) === 'pass')) dates.push(date);
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

export interface FastDurationPoint {
  start_at: string;
  label: string; // short date label for the axis
  hours: number;
  goal_hours: number;
  hit: boolean;
}

/** One point per completed fast, chronological. */
export function fastDurationSeries(fasts: Fast[], tz: string): FastDurationPoint[] {
  return completedFasts(fasts).map((f) => {
    const hours = hoursBetween(f.start_at, f.end_at as string);
    const localDay = toLocalInputValue(f.start_at, tz).slice(5, 10); // MM-DD
    return {
      start_at: f.start_at,
      label: localDay,
      hours: Math.round(hours * 10) / 10,
      goal_hours: f.goal_hours,
      hit: hours >= f.goal_hours,
    };
  });
}

export interface HistogramBin {
  label: string;
  from: number;
  to: number;
  count: number;
}

/** Bucket completed-fast durations into fixed-width bins. */
export function durationHistogram(fasts: Fast[], binHours = 4): HistogramBin[] {
  const hours = completedFasts(fasts).map((f) =>
    hoursBetween(f.start_at, f.end_at as string)
  );
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
  for (const f of completedFasts(fasts)) {
    const h = Number(toLocalInputValue(f.start_at, tz).slice(11, 13));
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
  // Longest run across all covered days.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && addDays(prev, 1) === d) run++;
    else run = 1;
    if (run > longest) longest = run;
    prev = d;
  }
  // Current run ending today (or yesterday, so an unbroken habit shows through).
  let current = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

// ── Pushups ─────────────────────────────────────────────────────────

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

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

/** Cumulative days completed over the session log (chronological). */
export function completionTimeline(sessions: PushupSession[]): CompletionPoint[] {
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
  sessions: PushupSession[],
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
