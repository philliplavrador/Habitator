// Habit scheduling — pure, client-safe logic (no DB, no server imports) so both
// the Today/insights server code and the AddHabitForm client can share it.
//
// A habit's `schedule` says when it's *expected*. It's stored as JSON-in-TEXT in
// `habits.schedule` (NULL ⇒ daily, so every pre-schedule row keeps working) and
// hydrated to the `Schedule` union (lib/types.ts) by the habits row hydrator.
//
// Accountability (see lib/stats.ts): `daily` is LENIENT (a blank day is an
// exception, never a miss). The three explicit kinds are STRICT — a due day you
// don't complete is a miss that breaks the streak.

import { addDays, compareISO, daysBetween, weekdayOf } from './dates';
import type { Schedule, ScheduleKind } from './types';

export const DAILY: Schedule = { kind: 'daily' };

const KINDS: ScheduleKind[] = ['daily', 'weekdays', 'interval', 'weekly'];

/** Short weekday names, indexed 0=Sun … 6=Sat (matches {@link weekdayOf}). */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 365;
const MIN_WEEKLY = 1;
const MAX_WEEKLY = 7;

function uniqSortedDays(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<number>();
  for (const v of raw) {
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isInteger(n) && n >= 0 && n <= 6) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Validate/normalize an arbitrary value into a Schedule, or return an error
 * string. Used by the request validator AND as the single source of truth for
 * what a well-formed schedule is. `null`/`undefined`/`{}` normalize to daily.
 */
export function normalizeSchedule(
  raw: unknown
): { ok: true; value: Schedule } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: DAILY };
  if (typeof raw !== 'object') {
    return { ok: false, error: 'schedule must be an object.' };
  }
  const kind = (raw as { kind?: unknown }).kind;
  const k = typeof kind === 'string' && kind !== '' ? kind : 'daily';
  if (!KINDS.includes(k as ScheduleKind)) {
    return { ok: false, error: `schedule.kind must be one of ${KINDS.join(', ')}.` };
  }
  switch (k as ScheduleKind) {
    case 'daily':
      return { ok: true, value: DAILY };
    case 'weekdays': {
      const days = uniqSortedDays((raw as { days?: unknown }).days);
      if (days.length === 0) {
        return { ok: false, error: 'Pick at least one weekday.' };
      }
      return { ok: true, value: { kind: 'weekdays', days } };
    }
    case 'interval': {
      const rawEvery = (raw as { every?: unknown }).every;
      const every = typeof rawEvery === 'number' ? rawEvery : Number(rawEvery);
      if (!Number.isInteger(every) || every < MIN_INTERVAL || every > MAX_INTERVAL) {
        return {
          ok: false,
          error: `Interval must be a whole number of days ${MIN_INTERVAL}–${MAX_INTERVAL}.`,
        };
      }
      // "every 1 day" is just daily — collapse it so stats stay lenient.
      return every === 1
        ? { ok: true, value: DAILY }
        : { ok: true, value: { kind: 'interval', every } };
    }
    case 'weekly': {
      const rawCount = (raw as { count?: unknown }).count;
      const count = typeof rawCount === 'number' ? rawCount : Number(rawCount);
      if (!Number.isInteger(count) || count < MIN_WEEKLY || count > MAX_WEEKLY) {
        return { ok: false, error: `Weekly target must be ${MIN_WEEKLY}–${MAX_WEEKLY}.` };
      }
      return { ok: true, value: { kind: 'weekly', count } };
    }
  }
}

/** Parse the raw DB column (JSON-in-TEXT). Anything malformed falls back to daily. */
export function parseSchedule(raw: string | null | undefined): Schedule {
  if (!raw) return DAILY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DAILY;
  }
  const res = normalizeSchedule(parsed);
  return res.ok ? res.value : DAILY;
}

/** Serialize back to the column: NULL for daily (keeps old rows canonical). */
export function serializeSchedule(s: Schedule): string | null {
  return s.kind === 'daily' ? null : JSON.stringify(s);
}

/**
 * Is the habit expected on `date`? Never before `start_date`. `weekly` has no
 * fixed day, so it's "due" every day (the target is enforced per-week in stats).
 */
export function isDueOn(schedule: Schedule, startDate: string, date: string): boolean {
  if (compareISO(date, startDate) < 0) return false;
  switch (schedule.kind) {
    case 'daily':
    case 'weekly':
      return true;
    case 'weekdays':
      return schedule.days.includes(weekdayOf(date));
    case 'interval':
      return daysBetween(startDate, date) % schedule.every === 0;
  }
}

/** Sunday of the calendar week containing `date` (YYYY-MM-DD). */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

/** Human label for the schedule, e.g. "Daily", "Every Wed", "Every 2 days", "3× / week". */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.kind) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      if (schedule.days.length === 7) return 'Every day';
      return schedule.days.map((d) => WEEKDAY_LABELS[d]).join(', ');
    case 'interval':
      return `Every ${schedule.every} days`;
    case 'weekly':
      return `${schedule.count}× / week`;
  }
}
