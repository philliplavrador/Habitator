import ContributionGrid from './ContributionGrid';
import { formatHuman } from '@/lib/dates';
import type { EntryStatus, HabitKind } from '@/lib/types';

interface Props {
  /** date (YYYY-MM-DD) → status, for this habit. */
  statusByDate: Record<string, EntryStatus>;
  startDate: string;
  today: string;
  /** Number of weeks to show (columns). ~3 months by default. */
  weeks?: number;
  /** Habit kind — flips the meaning of a blank in-range day (see below). */
  kind?: HabitKind;
}

const KIND_CLASS: Record<string, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  blank: 'bg-surface2',
  before: 'bg-surface2/30',
  future: 'bg-transparent',
};

/**
 * GitHub-style contribution grid. Columns are weeks (Sunday at top); the last
 * column is the current week. Faint = before the habit started, transparent =
 * future days. Thin config wrapper over {@link ContributionGrid}.
 *
 * The in-range colouring depends on kind:
 *  - `build`: green = pass, red = fail, dim = blank/exception.
 *  - `quit` : every in-range day is clean (green) UNLESS it has a slip (red) —
 *    blanks are wins, not exceptions.
 */
export default function Heatmap({
  statusByDate,
  startDate,
  today,
  weeks = 14,
  kind = 'build',
}: Props) {
  const isQuit = kind === 'quit';
  const classify = isQuit
    ? (date: string) => (statusByDate[date] === 'fail' ? 'fail' : 'pass')
    : (date: string) => statusByDate[date] ?? 'blank';
  const kindLabel: Record<string, string> = isQuit
    ? { pass: 'clean', fail: 'slip' }
    : { pass: 'pass', fail: 'fail' };
  const posLabel = isQuit ? 'clean' : 'pass';
  const negLabel = isQuit ? 'slip' : 'fail';

  return (
    <ContributionGrid
      today={today}
      startDate={startDate}
      columns={{ type: 'fixed', weeks }}
      classify={classify}
      kindClass={KIND_CLASS}
      kindLabel={kindLabel}
      renderFooter={(gridStart, gridEnd) => (
        <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
          <span>
            {formatHuman(gridStart)} – {formatHuman(gridEnd)}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[3px] bg-pass" /> {posLabel}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[3px] bg-fail" /> {negLabel}
            </span>
          </span>
        </div>
      )}
    />
  );
}
