import ContributionGrid from './ContributionGrid';
import { formatHuman } from '@/lib/dates';
import { isDueOn } from '@/lib/schedule';
import type { EntryStatus, HabitKind, Schedule } from '@/lib/types';

interface Props {
  /** date (YYYY-MM-DD) → status, for this habit. */
  statusByDate: Record<string, EntryStatus>;
  startDate: string;
  /** Optional end date (YYYY-MM-DD); days after it render faint ("after range"). */
  endDate?: string | null;
  today: string;
  /** Number of weeks to show (columns). ~3 months by default. */
  weeks?: number;
  /** Habit kind — flips the meaning of a blank in-range day (see below). */
  kind?: HabitKind;
  /** Habit schedule — for strict weekday/interval habits, a past due day left
   *  blank is a MISS, and off-days are dimmed. Defaults to daily. */
  schedule?: Schedule;
}

const KIND_CLASS: Record<string, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  blank: 'bg-surface2',
  off: 'bg-surface2/30',
  before: 'bg-surface2/30',
  after: 'bg-surface2/30',
  future: 'bg-transparent',
};

/**
 * GitHub-style contribution grid. Columns are weeks (Sunday at top); the last
 * column is the current week. Faint = before the habit started, transparent =
 * future days. Thin config wrapper over {@link ContributionGrid}.
 *
 * The in-range colouring depends on kind + schedule:
 *  - `build` daily/weekly: green = pass, red = fail, dim = blank/exception.
 *  - `build` weekday/interval (STRICT): off-days are dimmed; a due day is green
 *    (pass) / red (fail OR a past blank you missed) / neutral (today, pending).
 *  - `quit`: every in-range day is clean (green) UNLESS it has a slip (red).
 */
export default function Heatmap({
  statusByDate,
  startDate,
  endDate = null,
  today,
  weeks = 14,
  kind = 'build',
  schedule = { kind: 'daily' },
}: Props) {
  const isQuit = kind === 'quit';
  // Strict per-day scheduling only applies to fixed-day / interval build habits;
  // `weekly` is scored per-week, so its heatmap stays lenient (pass or blank).
  const isStrictScheduled =
    !isQuit && (schedule.kind === 'weekdays' || schedule.kind === 'interval');

  let classify: (date: string) => string;
  if (isQuit) {
    classify = (date) => (statusByDate[date] === 'fail' ? 'fail' : 'pass');
  } else if (isStrictScheduled) {
    classify = (date) => {
      if (!isDueOn(schedule, startDate, date)) return 'off';
      const st = statusByDate[date];
      if (st === 'pass') return 'pass';
      if (st === 'fail') return 'fail';
      return date === today ? 'blank' : 'fail'; // past due day left blank = miss
    };
  } else {
    classify = (date) => statusByDate[date] ?? 'blank';
  }

  const kindLabel: Record<string, string> = isQuit
    ? { pass: 'clean', fail: 'slip' }
    : isStrictScheduled
      ? { pass: 'done', fail: 'miss', off: 'off' }
      : { pass: 'pass', fail: 'fail' };
  const posLabel = isQuit ? 'clean' : isStrictScheduled ? 'done' : 'pass';
  const negLabel = isQuit ? 'slip' : isStrictScheduled ? 'miss' : 'fail';

  return (
    <ContributionGrid
      today={today}
      startDate={startDate}
      endDate={endDate}
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
