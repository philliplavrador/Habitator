import type { ReactNode } from 'react';
import {
  addDays,
  compareISO,
  formatHuman,
  rangeDates,
  weekdayOf,
} from '@/lib/dates';

/**
 * How many week-columns the grid shows:
 *  - `fixed`: always exactly `weeks` columns.
 *  - `clamp`: enough columns to span `startDate`→`today`, clamped to `[min, max]`.
 */
export type ColumnStrategy =
  | { type: 'fixed'; weeks: number }
  | { type: 'clamp'; min: number; max: number };

export interface ContributionGridProps {
  /** Today's date (YYYY-MM-DD); the last column is today's week. */
  today: string;
  /** Days before this render as "before range" (faint). */
  startDate: string;
  /**
   * Optional end date (YYYY-MM-DD). Days after it render as "after range"
   * (classified `'after'`, faint) and never reach `classify`. Null ⇒ ongoing.
   */
  endDate?: string | null;
  /** Column-count strategy. */
  columns: ColumnStrategy;
  /**
   * Map an in-range date (startDate ≤ date ≤ today) to its kind — the key into
   * `kindClass` / `kindLabel`. Out-of-range days are classified internally as
   * `'before'` / `'future'`.
   */
  classify: (dateISO: string) => string;
  /** kind → cell background class. Must include `'before'` and `'future'`. */
  kindClass: Record<string, string>;
  /** Optional kind → tooltip suffix, rendered as ` · <label>`. */
  kindLabel?: Record<string, string>;
  /** Allow the grid to scroll horizontally when it overflows its container. */
  scrollX?: boolean;
  /** Optional footer/legend; receives the grid's inclusive date bounds. */
  renderFooter?: (gridStart: string, gridEnd: string) => ReactNode;
}

function resolveColumns(
  strategy: ColumnStrategy,
  startDate: string,
  today: string,
): number {
  if (strategy.type === 'fixed') return strategy.weeks;
  // Enough columns to span the first in-range day's week through this week.
  const spanDays =
    compareISO(startDate, today) <= 0 ? rangeDates(startDate, today).length : 1;
  return Math.min(
    strategy.max,
    Math.max(strategy.min, Math.ceil((spanDays + weekdayOf(startDate)) / 7)),
  );
}

/**
 * Shared GitHub-style contribution grid. Columns are weeks (Sunday at top); the
 * last column is the current week. Callers supply the kind→color mapping, the
 * per-day classifier, the column strategy, and an optional legend/footer, so the
 * cell-classification scaffold (future / before-range / in-range) lives in one
 * place. Pure CSS grid; no hooks — safe to render on the server.
 */
export default function ContributionGrid({
  today,
  startDate,
  endDate = null,
  columns,
  classify,
  kindClass,
  kindLabel,
  scrollX,
  renderFooter,
}: ContributionGridProps) {
  const cols = resolveColumns(columns, startDate, today);

  // Sunday of the current week, then walk back to the grid's first Sunday.
  const currentSunday = addDays(today, -weekdayOf(today));
  const gridStart = addDays(currentSunday, -(cols - 1) * 7);
  const gridEnd = addDays(currentSunday, 6); // Saturday of the current week

  const cells: { date: string; kind: string }[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < 7; row++) {
      const date = addDays(gridStart, col * 7 + row);
      let kind: string;
      if (compareISO(date, today) > 0) kind = 'future';
      else if (compareISO(date, startDate) < 0) kind = 'before';
      else if (endDate !== null && compareISO(date, endDate) > 0) kind = 'after';
      else kind = classify(date);
      cells.push({ date, kind });
    }
  }

  return (
    <div>
      <div
        className={`grid grid-flow-col grid-rows-7 gap-1${
          scrollX ? ' overflow-x-auto' : ''
        }`}
      >
        {cells.map((c) => {
          const label = kindLabel?.[c.kind];
          return (
            <div
              key={c.date}
              title={`${formatHuman(c.date)}${label ? ` · ${label}` : ''}`}
              className={`h-3 w-3 rounded-[3px] ${kindClass[c.kind]}`}
            />
          );
        })}
      </div>

      {renderFooter?.(gridStart, gridEnd)}
    </div>
  );
}
