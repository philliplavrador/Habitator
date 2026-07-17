import DeleteWidgetButton from './DeleteWidgetButton';
import RestWidgetButton from './RestWidgetButton';
import SummaryCard from './SummaryCard';
import { formatHuman } from '@/lib/dates';
import type { RepProgramState } from '@/lib/types';

/**
 * Compact, non-interactive rep-program card for the Today screen. Shows program
 * progress (as a % done, like the Anki widget) and the attempt streak at a glance,
 * and links to the full screen for logging, history, heatmap, and charts. Shared
 * by pushups, pullups, and the user-defined programs.
 */
export default function RepProgramSummary({
  state,
  deleteEndpoint,
  today,
  restedToday = false,
  restReason,
}: {
  state: RepProgramState;
  /** When set, the card shows a delete button wired to this endpoint. */
  deleteEndpoint?: string;
  /** The Today screen's day — the day a rest button excuses. */
  today: string;
  /** Whether this program is excused (a rest day) for `today`. */
  restedToday?: boolean;
  /** The excuse note, if any. */
  restReason?: string | null;
}) {
  const pct = (state.completedCount / state.programDays) * 100;
  const done = state.doneToday !== null;

  return (
    <SummaryCard
      title={state.label}
      href={state.href}
      pct={pct}
      complete={state.programComplete}
      rested={restedToday}
      restReason={restReason}
      action={
        <>
          <RestWidgetButton
            scope="rep"
            refId={state.key}
            date={today}
            dateLabel={formatHuman(today)}
            restedToday={restedToday}
            label={state.label}
          />
          {deleteEndpoint ? (
            <DeleteWidgetButton label={state.label} endpoint={deleteEndpoint} />
          ) : null}
        </>
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
