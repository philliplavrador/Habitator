import DeleteWidgetButton from './DeleteWidgetButton';
import SummaryCard from './SummaryCard';
import type { RepProgramState } from '@/lib/types';

/**
 * Compact, non-interactive rep-program card for the Today screen. Shows program
 * progress and the attempt streak at a glance and links to the full screen for
 * logging, history, heatmap, and charts. Shared by pushups, pullups, and the
 * user-defined programs.
 */
export default function RepProgramSummary({
  state,
  deleteEndpoint,
}: {
  state: RepProgramState;
  /** When set, the card shows a delete button wired to this endpoint. */
  deleteEndpoint?: string;
}) {
  const pct = (state.completedCount / state.programDays) * 100;
  const done = state.doneToday !== null;

  return (
    <SummaryCard
      title={state.label}
      href={state.href}
      pct={pct}
      complete={state.programComplete}
      badge={`Day ${state.currentDay} of ${state.programDays}`}
      action={
        deleteEndpoint ? (
          <DeleteWidgetButton label={state.label} endpoint={deleteEndpoint} />
        ) : null
      }
      aside={
        state.currentStreak > 0 ? (
          <span className="text-text-muted">🔥 {state.currentStreak}</span>
        ) : null
      }
    >
      {state.programComplete ? (
        <span className="text-text-secondary">
          All {state.programDays} days done 💪
        </span>
      ) : done ? (
        <span className="font-semibold text-pass">✓ Done today</span>
      ) : (
        <span className="text-text-muted">
          Today:{' '}
          <span className="font-semibold text-text-secondary">
            {state.target.join(' · ')}
          </span>
        </span>
      )}
    </SummaryCard>
  );
}
