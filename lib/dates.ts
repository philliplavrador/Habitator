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
