import ContributionGrid from './ContributionGrid';
import type { RepDayStatus } from '@/lib/types';

interface Props {
  /** date (YYYY-MM-DD) → outcome, for days that had a session. */
  statusByDate: Record<string, RepDayStatus>;
  /** Dates (YYYY-MM-DD) marked as rest-day exceptions — rendered neon pink. */
  exceptions?: string[];
  /** Earliest session date — days before it render as "not started". */
  startDate: string;
  today: string;
  /** Override the number of week columns; defaults to cover startDate→today. */
  weeks?: number;
}

const KIND_CLASS: Record<string, string> = {
  complete: 'bg-pass',
  attempted: 'bg-warn',
  exception: 'bg-exception',
  skipped: 'bg-surface2',
  before: 'bg-surface2/30',
  future: 'bg-transparent',
};

const KIND_LABEL: Record<string, string> = {
  complete: 'completed',
  attempted: 'attempted',
  exception: 'rest day',
  skipped: 'skipped',
};

/**
 * GitHub-style contribution grid for a rep program. Three meaningful colors:
 * green = every set completed, amber = attempted but fell short, dim = skipped
 * (a day in range with no session). Faint = before the first session,
 * transparent = future. Thin config wrapper over {@link ContributionGrid}.
 */
export default function SessionHeatmap({
  statusByDate,
  exceptions = [],
  startDate,
  today,
  weeks,
}: Props) {
  const exceptionSet = new Set(exceptions);
  const hasExceptions = exceptionSet.size > 0;
  return (
    <ContributionGrid
      today={today}
      startDate={startDate}
      columns={
        weeks != null
          ? { type: 'fixed', weeks }
          : { type: 'clamp', min: 9, max: 53 }
      }
      // A rest-day exception wins over the session outcome (neon pink).
      classify={(date) =>
        exceptionSet.has(date) ? 'exception' : statusByDate[date] ?? 'skipped'
      }
      kindClass={KIND_CLASS}
      kindLabel={KIND_LABEL}
      scrollX
      renderFooter={() => (
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
          {hasExceptions && (
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[3px] bg-exception" /> Rest
            </span>
          )}
        </div>
      )}
    />
  );
}
