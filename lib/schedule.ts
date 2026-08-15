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

import {
  addDays,
  compareISO,
  daysBetween,
  monthlyAnchorOnOrBefore,
  weekdayOf,
} from './dates';
import type { Schedule, ScheduleKind } from './types';

export const DAILY: Schedule = { kind: 'daily' };

const KINDS: ScheduleKind[] = [
  'daily',
  'weekdays',
  'interval',
  'weekly',
  'monthly',
];

/**
 * The `day` value that means "the last day of the month", whatever its length.
 * Only 1..28 and this sentinel are accepted: 29 and 30 would have to silently
 * clamp in February, so "the 30th" would quietly mean the 28th some months —
 * better to reject them and make the user pick "last day" if that's what they
 * meant.
 */
export const MONTHLY_LAST = 31;

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
    case 'monthly': {
      const rawDay = (raw as { day?: unknown }).day;
      const day = typeof rawDay === 'number' ? rawDay : Number(rawDay);
      const usable =
        Number.isInteger(day) && ((day >= 1 && day <= 28) || day === MONTHLY_LAST);
      if (!usable) {
        return {
          ok: false,
          error: 'Monthly day must be 1–28, or the last day of the month.',
        };
      }
      return { ok: true, value: { kind: 'monthly', day } };
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
 *
 * `lastPass` — the habit's most recent 'pass' entry on or before `date`, or null
 * — is required ONLY by `monthly`, whose whole point is that it stays due until
 * completed. Every other kind ignores it, which is why it's optional.
 *
 * Omitting it for a monthly habit degrades to "due every day from the anchor
 * onwards". That's the right answer for the heatmap/calendar, which paint what
 * a day *could* have been rather than what it turned out to be, but it is WRONG
 * for the Today screen — pass the real value there (app/page.tsx batches it).
 */
export function isDueOn(
  schedule: Schedule,
  startDate: string,
  date: string,
  lastPass?: string | null
): boolean {
  if (compareISO(date, startDate) < 0) return false;
  switch (schedule.kind) {
    case 'daily':
    case 'weekly':
      return true;
    case 'weekdays':
      return schedule.days.includes(weekdayOf(date));
    case 'interval':
      return daysBetween(startDate, date) % schedule.every === 0;
    case 'monthly': {
      const anchor = monthlyAnchorOnOrBefore(date, schedule.day);
      // The cycle that would make it due began before the habit existed.
      if (compareISO(anchor, startDate) < 0) return false;
      // Open until something completes it on/after the anchor.
      if (!lastPass) return true;
      return compareISO(lastPass, anchor) < 0;
    }
  }
}

/**
 * Today-screen due-ness. Delegates to {@link isDueOn} for every kind except
 * `monthly`, which needs three rules that a pure (schedule, start, date)
 * predicate structurally cannot express:
 *
 * 1. **A rest day satisfies the whole cycle, not one day.** For every other kind
 *    excusing a day is enough, because the habit isn't due again until its next
 *    scheduled day. A rolling monthly obligation would be back tomorrow — so one
 *    ◆ tap would have to be repeated every single day forever. `lastSettled` is
 *    therefore the later of the last pass and the last rest day.
 * 2. **Never read the future.** `lastSettled` must be capped at today even when
 *    previewing a future date, or a rest day planned inside the 90-day window
 *    would reach back and cancel an obligation that is open right now.
 * 3. **A day you already acted on stays visible.** Once a pass lands, plain
 *    due-ness goes false, which would make the habit vanish from the very day
 *    you completed it. `hasRecordOnDate` keeps it on screen (in the Completed
 *    zone, where it belongs).
 *
 * On a FUTURE date the habit shows only on the anchor day itself. Whether it
 * will still be open on the days after is a function of what you do between now
 * and then, which is unknowable — claiming it's due on all 74 remaining preview
 * days would be noise, not information.
 */
export function isDueOnScreen(args: {
  schedule: Schedule;
  startDate: string;
  /** The day being rendered. */
  date: string;
  /** Today in the owner's zone — the boundary past which nothing is knowable. */
  today: string;
  /** Later of (last pass, last rest day), already capped at min(date, today). */
  lastSettled: string | null;
  /** An entry or rest day exists for `date` itself. */
  hasRecordOnDate: boolean;
}): boolean {
  const { schedule, startDate, date, today, lastSettled, hasRecordOnDate } = args;
  if (schedule.kind !== 'monthly') {
    return isDueOn(schedule, startDate, date);
  }
  if (compareISO(date, startDate) < 0) return false;

  if (compareISO(date, today) > 0) {
    // Preview: only the anchor day itself is honest.
    return monthlyAnchorOnOrBefore(date, schedule.day) === date;
  }
  return isDueOn(schedule, startDate, date, lastSettled) || hasRecordOnDate;
}

/**
 * How many days late a rolling monthly habit is on `date`, or 0 when it's due
 * today / not due. Drives the "Overdue N days" line on the Today screen: with no
 * misses ever recorded, that line is the only thing that tells the truth about a
 * monthly habit being ignored.
 */
export function monthlyOverdueDays(
  schedule: Schedule,
  startDate: string,
  date: string,
  lastPass?: string | null
): number {
  if (schedule.kind !== 'monthly') return 0;
  if (!isDueOn(schedule, startDate, date, lastPass)) return 0;
  const anchor = monthlyAnchorOnOrBefore(date, schedule.day);
  return Math.max(0, daysBetween(anchor, date));
}

/** Sunday of the calendar week containing `date` (YYYY-MM-DD). */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

/** English ordinal for a day of the month: 1st, 2nd, 3rd, 4th … 21st, 22nd. */
export function ordinalDay(n: number): string {
  // 11/12/13 are the exceptions that break the simple last-digit rule.
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen
    ? 'th'
    : n % 10 === 1
      ? 'st'
      : n % 10 === 2
        ? 'nd'
        : n % 10 === 3
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
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
    case 'monthly':
      return schedule.day === MONTHLY_LAST
        ? 'Monthly, last day'
        : `Monthly on the ${ordinalDay(schedule.day)}`;
  }
}
