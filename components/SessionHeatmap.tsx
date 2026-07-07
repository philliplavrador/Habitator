import {
  addDays,
  compareISO,
  formatHuman,
  rangeDates,
  weekdayOf,
} from '@/lib/dates';
import type { RepDayStatus } from '@/lib/types';

interface Props {
  /** date (YYYY-MM-DD) → outcome, for days that had a session. */
  statusByDate: Record<string, RepDayStatus>;
  /** Earliest session date — days before it render as "not started". */
  startDate: string;
  today: string;
  /** Override the number of week columns; defaults to cover startDate→today. */
  weeks?: number;
}

type Kind = RepDayStatus | 'skipped' | 'before' | 'future';

const KIND_CLASS: Record<Kind, string> = {
  complete: 'bg-pass',
  attempted: 'bg-warn',
  skipped: 'bg-surface2',
  before: 'bg-surface2/30',
  future: 'bg-transparent',
};

const KIND_LABEL: Partial<Record<Kind, string>> = {
  complete: 'completed',
  attempted: 'attempted',
  skipped: 'skipped',
};

/**
 * GitHub-style contribution grid for a rep program. Three meaningful colors:
 * green = every set completed, amber = attempted but fell short, dim = skipped
 * (a day in range with no session). Faint = before the first session,
 * transparent = future. Columns are weeks (Sunday at top).
 */
export default function SessionHeatmap({
  statusByDate,
  startDate,
  today,
  weeks,
}: Props) {
  // Enough columns to span the first session's week through this week.
  const spanDays =
    compareISO(startDate, today) <= 0 ? rangeDates(startDate, today).length : 1;
  const cols =
    weeks ??
    Math.min(53, Math.max(9, Math.ceil((spanDays + weekdayOf(startDate)) / 7)));

  // Sunday of the current week, then walk back to the grid's first Sunday.
  const currentSunday = addDays(today, -weekdayOf(today));
  const gridStart = addDays(currentSunday, -(cols - 1) * 7);
  const gridEnd = addDays(currentSunday, 6);

  const cells: { date: string; kind: Kind }[] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < 7; row++) {
      const date = addDays(gridStart, col * 7 + row);
      let kind: Kind;
      if (compareISO(date, today) > 0) kind = 'future';
      else if (compareISO(date, startDate) < 0) kind = 'before';
      else kind = statusByDate[date] ?? 'skipped';
      cells.push({ date, kind });
    }
  }

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
        {cells.map((c) => {
          const label = KIND_LABEL[c.kind];
          return (
            <div
              key={c.date}
              title={`${formatHuman(c.date)}${label ? ` · ${label}` : ''}`}
              className={`h-3 w-3 rounded-[3px] ${KIND_CLASS[c.kind]}`}
            />
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-pass" /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-warn" /> Attempted
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-[3px] bg-surface2" /> Skipped
        </span>
      </div>
    </div>
  );
}
