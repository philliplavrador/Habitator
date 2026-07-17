import DeleteWidgetButton from './DeleteWidgetButton';
import RestWidgetButton from './RestWidgetButton';
import SummaryCard from './SummaryCard';
import { formatHuman } from '@/lib/dates';
import type { AnkiState } from '@/lib/types';

/**
 * Compact, non-interactive deck card for the Today screen. Shows cards progress
 * and today's log status at a glance; links to /japanese for logging, history,
 * pace, and the completion estimates.
 */
export default function AnkiSummary({
  state,
  deleteEndpoint,
  today,
  restedToday = false,
  restReason,
}: {
  state: AnkiState;
  /** When set, the card shows a delete button wired to this endpoint. */
  deleteEndpoint?: string;
  /** The Today screen's day — the day a rest button excuses. */
  today: string;
  /** Whether the deck is excused (a rest day) for `today`. */
  restedToday?: boolean;
  /** The excuse note, if any. */
  restReason?: string | null;
}) {
  const paceAhead = state.paceDeltaCards >= 0;

  return (
    <SummaryCard
      title="Japanese"
      href="/japanese"
      pct={state.cardsPct * 100}
      complete={state.goalReached}
      rested={restedToday}
      restReason={restReason}
      action={
        <>
          <RestWidgetButton
            scope="anki"
            refId="japanese"
            date={today}
            dateLabel={formatHuman(today)}
            restedToday={restedToday}
            label="Japanese"
          />
          {deleteEndpoint ? (
            <DeleteWidgetButton label="Japanese" endpoint={deleteEndpoint} />
          ) : null}
        </>
      }
    >
      {state.goalReached ? (
        <span className="text-text-secondary">
          {state.goal.toLocaleString()} cards done 🎉
        </span>
      ) : state.loggedToday ? (
        <span className="font-semibold text-pass">
          ✓ {state.todayCount} today · {state.remaining.toLocaleString()} to go
        </span>
      ) : (
        <span className="text-text-muted">
          <span className={paceAhead ? 'text-pass' : 'text-warn'}>
            {paceAhead ? '▲' : '▼'} {Math.abs(state.paceDeltaCards).toLocaleString()}
          </span>{' '}
          {paceAhead ? 'ahead' : 'behind'} · log today
        </span>
      )}
    </SummaryCard>
  );
}
