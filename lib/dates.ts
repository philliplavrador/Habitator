// Local-day date helpers. The whole app operates on calendar dates in the
// owner's local timezone, stored as `YYYY-MM-DD` strings to dodge UTC drift.
//
// "Today" is derived from the local clock. Arithmetic and comparison treat the
// date string as a timezone-neutral calendar date (we never round-trip it back
// through the local clock), so DST shifts can't move a day.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Today's calendar date in the local timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

/** Day of week for an ISO date: 0=Sunday … 6=Saturday. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
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
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  const mo = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][dt.getUTCMonth()];
  return `${wd}, ${mo} ${dt.getUTCDate()}`;
}

/** Friendly relative label: "Today", "Yesterday", else the human date. */
export function relativeLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return formatHuman(iso);
}

// ── Timestamp / duration helpers (for fasting) ──────────────────────
// Habits are day-granular (YYYY-MM-DD); a fast is a timespan, so it needs
// full ISO timestamps and duration math. These use the local clock for
// display and Date parsing for arithmetic.

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
 * expects: local wall-clock `YYYY-MM-DDTHH:mm` (minute precision). Client-only.
 */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Human label for an instant, e.g. "Jul 4, 2:15 PM" (local time). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mo = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][d.getMonth()];
  let h = d.getHours();
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${mo} ${d.getDate()}, ${h}:${pad2(d.getMinutes())} ${ampm}`;
}
