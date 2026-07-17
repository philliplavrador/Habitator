// Client-safe month-grid helpers shared by the editable calendars (HabitCalendar
// and RestDayEditor). Pure date math on YYYY-MM (month) and YYYY-MM-DD strings —
// no DB, no server imports — so it bundles into either client component.

import { weekdayOf } from '@/lib/dates';

/** Single-letter weekday headers, Sunday-first (matches weekdayOf). */
export const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Shift a YYYY-MM month by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** Human label for a YYYY-MM month, e.g. "July 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[m - 1]} ${y}`;
}

/** Cells for a month grid: leading nulls for the first weekday, then each day. */
export function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  // Days in `month`. `m` is 1-based (Jan=1), and JS months are 0-based, so `m`
  // is really "next month"; day 0 of next month = the last day of `month`.
  // (The usual -1 to convert to a 0-based index is intentionally omitted — it's
  // what makes this land on the previous month's last day = days-in-month.)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = weekdayOf(`${month}-01`);
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${pad2(d)}`);
  return cells;
}
