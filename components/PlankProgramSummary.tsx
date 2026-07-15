import DeleteWidgetButton from './DeleteWidgetButton';
import SummaryCard from './SummaryCard';
import { formatHold } from '@/lib/plankFormat';
import type { PlankProgramState } from '@/lib/types';

/**
 * Compact, non-interactive plank-program card for the Today screen. Shows program
 * progress (as a % done, like the Anki widget) and the attempt streak at a glance,
 * and links to the full screen for logging, history, heatmap, and charts.
 */
export default function PlankProgramSummary({
  state,
  deleteEndpoint,
}: {
  state: PlankProgramState;
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
            {formatHold(state.targetSeconds)} hold
          </span>
        </span>
      )}
    </SummaryCard>
  );
}
