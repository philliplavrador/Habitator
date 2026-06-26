import { addDays, compareISO, formatHuman, weekdayOf } from '@/lib/dates';
import type { EntryStatus } from '@/lib/types';

interface Props {
  /** date (YYYY-MM-DD) → status, for this habit. */
  statusByDate: Record<string, EntryStatus>;
  startDate: string;
  today: string;
  /** Number of weeks to show (columns). ~3 months by default. */
  weeks?: number;
}

type Cell = { date: string; kind: 'pass' | 'fail' | 'blank' | 'before' | 'future' };

const KIND_CLASS: Record<Cell['kind'], string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  blank: 'bg-surface2',
  before: 'bg-surface2/30',
  future: 'bg-transparent',
};

/**
 * GitHub-style contribution grid. Columns are weeks (Sunday at top); the last
 * column is the current week. Green = pass, red = fail, dim = blank/exception,
 * faint = before the habit started, transparent = future days. Pure CSS grid.
 */
export default function Heatmap({ statusByDate, startDate, today, weeks = 14 }: Props) {
  // Sunday of the current week, then walk back to the grid's first Sunday.
  const currentSunday = addDays(today, -weekdayOf(today));
  const gridStart = addDays(currentSunday, -(weeks - 1) * 7);
  const gridEnd = addDays(currentSunday, 6); // Saturday of current week

  const cells: Cell[] = [];
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const date = addDays(gridStart, col * 7 + row);
      let kind: Cell['kind'];
      if (compareISO(date, today) > 0) kind = 'future';
      else if (compareISO(date, startDate) < 0) kind = 'before';
      else {
        const s = statusByDate[date];
        kind = s ?? 'blank';
      }
      cells.push({ date, kind });
    }
  }

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1">
        {cells.map((c) => (
          <div
            key={c.date}
            title={`${formatHuman(c.date)}${
              c.kind === 'pass'
                ? ' · pass'
                : c.kind === 'fail'
                ? ' · fail'
                : ''
            }`}
            className={`h-3 w-3 rounded-[3px] ${KIND_CLASS[c.kind]}`}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
        <span>
          {formatHuman(gridStart)} – {formatHuman(gridEnd)}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-pass" /> pass
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-[3px] bg-fail" /> fail
          </span>
        </span>
      </div>
    </div>
  );
}
