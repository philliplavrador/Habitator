import ContributionGrid from './ContributionGrid';
import { formatHuman } from '@/lib/dates';
import type { EntryStatus } from '@/lib/types';

interface Props {
  /** date (YYYY-MM-DD) → status, for this habit. */
  statusByDate: Record<string, EntryStatus>;
  startDate: string;
  today: string;
  /** Number of weeks to show (columns). ~3 months by default. */
  weeks?: number;
}

const KIND_CLASS: Record<string, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  blank: 'bg-surface2',
  before: 'bg-surface2/30',
  future: 'bg-transparent',
};

const KIND_LABEL: Record<string, string> = {
  pass: 'pass',
  fail: 'fail',
};

/**
 * GitHub-style contribution grid. Columns are weeks (Sunday at top); the last
 * column is the current week. Green = pass, red = fail, dim = blank/exception,
 * faint = before the habit started, transparent = future days. Thin config
 * wrapper over {@link ContributionGrid}.
 */
export default function Heatmap({ statusByDate, startDate, today, weeks = 14 }: Props) {
  return (
    <ContributionGrid
      today={today}
      startDate={startDate}
      columns={{ type: 'fixed', weeks }}
      classify={(date) => statusByDate[date] ?? 'blank'}
      kindClass={KIND_CLASS}
      kindLabel={KIND_LABEL}
      renderFooter={(gridStart, gridEnd) => (
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
      )}
    />
  );
}
