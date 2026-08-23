// Local-day date helpers. The whole app operates on calendar dates in the
// owner's local timezone, stored as `YYYY-MM-DD` strings to dodge UTC drift.
//
// Timezone handling is automatic: the owner's IANA zone (e.g. "America/New_York")
// is auto-detected in the browser, saved to the `tz` cookie, and read back on the
// server (see lib/tz.ts). Every wall-clock function here takes that zone as an
// explicit `tz` argument, so server render and client render agree exactly — no
// dependence on where the server runs, and no hydration drift.
//
// "Today" is derived from the owner's zone. Arithmetic and comparison treat the
// date string as a timezone-neutral calendar date (we never round-trip it back
// through a clock), so DST shifts can't move a day.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// ── Timezone plumbing ───────────────────────────────────────────────
// TZ_COOKIE and isValidTimeZone live here (not lib/tz.ts) because this module
// is client-safe: the browser-side TimezoneSync component and the server-side
// resolver both need them, and lib/tz.ts pulls in `next/headers` (server-only).

/** Cookie that carries the owner's auto-detected IANA timezone. */
export const TZ_COOKIE = 'tz';

/** True if `tz` is an IANA zone the runtime's Intl accepts (else it throws). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz === '') return false;
  try {
    // Constructing with an unknown timeZone throws a RangeError.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Break an instant into its calendar/clock parts *as seen in `tz`*. This is the
 * one primitive every zoned helper builds on: it uses Intl (which knows the full
 * IANA rule set incl. DST) instead of the runtime's own `Date` accessors, so the
 * result is independent of the process/browser timezone.
 */
function zonedParts(instant: Date, tz: string): {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  // Under hour12:false some ICU builds emit "24" for midnight; normalize to 0.
  if (out.hour === 24) out.hour = 0;
  return {
    year: out.year, month: out.month, day: out.day,
    hour: out.hour, minute: out.minute, second: out.second,
  };
}

/** Today's calendar date in the owner's timezone, as YYYY-MM-DD. */
export function todayISO(tz: string): string {
  const { year, month, day } = zonedParts(new Date(), tz);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * The current wall-clock time in `tz`, as "HH:MM" (24-hour, zero-padded).
 *
 * The reminder sender compares this against a habit's `notify_at` to decide
 * whether its time has come for that user today. Same Intl-based primitive as
 * {@link todayISO}, so it agrees with the day boundary exactly — including
 * across DST, where the two must not disagree about which day it is.
 */
export function localClockHM(tz: string): string {
  const { hour, minute } = zonedParts(new Date(), tz);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** True if `s` is a "HH:MM" 24-hour clock time. */
export function isValidClockHM(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * Render an "HH:MM" 24-hour clock time as a friendly 12-hour label, e.g.
 * "09:30" → "9:30 AM". Pure string work on an already-local wall-clock string
 * (a task's `at_time` is stored in the owner's zone), so no Date/zone involved.
 */
export function formatClockHM(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

/** True if `s` is a well-formed, real calendar date in YYYY-MM-DD form. */
export function isValidISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject impossible days like 2024-02-31 by round-tripping through UTC.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Add (or subtract) whole days to an ISO date. Returns YYYY-MM-DD. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(
    dt.getUTCDate()
  )}`;
}

/** -1 if a<b, 0 if equal, 1 if a>b. Plain lexical compare works for ISO dates. */
export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Number of days in the given month (1-based month), leap years included. */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the NEXT month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The most recent occurrence of monthly anchor day `day` on or before `date`.
 *
 * `day` is 1..28, or 31 meaning "the last day of the month" (see MONTHLY_LAST in
 * lib/schedule.ts). 29 and 30 are deliberately not accepted upstream: they would
 * have to silently clamp in February, which makes "the 30th" mean two different
 * things depending on the month.
 *
 * Pure calendar arithmetic on the string's parts — never a round-trip through a
 * clock — so no timezone or DST can shift which day this reports.
 */
export function monthlyAnchorOnOrBefore(date: string, day: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const anchorThis = Math.min(day, daysInMonth(y, m));
  if (d >= anchorThis) return `${y}-${pad2(m)}-${pad2(anchorThis)}`;
  // Before this month's anchor → the previous month's (rolls the year at Jan).
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${pad2(pm)}-${pad2(Math.min(day, daysInMonth(py, pm)))}`;
}

/** Day of week for an ISO date: 0=Sunday … 6=Saturday. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole calendar days from `aISO` to `bISO` (b − a); negative if b is earlier. */
export function daysBetween(aISO: string, bISO: string): number {
  const [ay, am, ad] = aISO.split('-').map(Number);
  const [by, bm, bd] = bISO.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

/** Inclusive list of every date string from `startISO` to `endISO`. */
export function rangeDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  let cur = startISO;
  // Guard against an inverted range producing an infinite loop.
  if (compareISO(startISO, endISO) > 0) return out;
  while (compareISO(cur, endISO) <= 0) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Human label like "Thu, Jun 25". Uses UTC parts so it matches the stored day. */
export function formatHuman(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[dt.getUTCDay()]}, ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

/** Human label with year, e.g. "Jan 19, 2027". UTC parts match the stored day. */
export function formatHumanYear(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * How far past today the Today screen may look ahead. A future day is a
 * READ-ONLY preview of what's scheduled — you can't check a day off before it
 * happens — except for rest days, which may be planned ahead (excuse next
 * Tuesday before a trip). A quarter is enough to plan around travel and keeps
 * the forward arrow from running forever.
 *
 * Two places enforce it: the Today page clamps `?date=` to this window, and
 * POST/DELETE /api/exceptions accepts future dates only within it (and only for
 * scope 'habit').
 */
export const MAX_FUTURE_DAYS = 90;

/**
 * Friendly relative label: "Today", "Yesterday", "Tomorrow", else the human
 * date. `today` is passed in (the caller computes it once via {@link todayISO}
 * with the owner's zone) so this stays a pure string function.
 */
export function relativeLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  return formatHuman(iso);
}

// ── Timestamp / duration helpers (for fasting) ──────────────────────
// Habits are day-granular (YYYY-MM-DD); a fast is a timespan, so it needs full
// ISO timestamps and duration math. Instants are stored/transported in UTC
// (unambiguous); only *display* is zoned, via the `tz` argument.

/** Current instant as a full ISO 8601 timestamp (UTC). */
export function nowISO(): string {
  return new Date().toISOString();
}

/** True if `s` is a string that parses to a real instant. */
export function isValidTimestamp(s: unknown): s is string {
  if (typeof s !== 'string' || s.trim() === '') return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

/** Fractional hours from `startISO` to `endISO` (negative if inverted). */
export function hoursBetween(startISO: string, endISO: string): number {
  return (Date.parse(endISO) - Date.parse(startISO)) / 3_600_000;
}

/**
 * Compact duration label from hours, e.g. 16.54 → "16h 32m". Floors to the
 * whole minute (like a stopwatch) so the label never rounds *up* past a goal —
 * e.g. 15h 59m 45s reads "15h 59m", staying consistent with the goal-hit check.
 */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.max(0, Math.floor(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/** Live-timer label from whole seconds, e.g. 3723 → "01:02:03". */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

/**
 * Convert an ISO instant to the value shape a `<input type="datetime-local">`
 * expects: `YYYY-MM-DDTHH:mm` (minute precision) as wall-clock time in `tz`.
 */
export function toLocalInputValue(iso: string, tz: string): string {
  const { year, month, day, hour, minute } = zonedParts(new Date(iso), tz);
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}`;
}

/** Human label for an instant in `tz`, e.g. "Jul 4, 2:15 PM". */
export function formatDateTime(iso: string, tz: string): string {
  const { month, day, hour, minute } = zonedParts(new Date(iso), tz);
  const ampm = hour < 12 ? 'AM' : 'PM';
  let h = hour % 12;
  if (h === 0) h = 12;
  return `${MONTHS[month - 1]} ${day}, ${h}:${pad2(minute)} ${ampm}`;
}
