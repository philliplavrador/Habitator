import SummaryCard from './SummaryCard';
import type { AnkiState } from '@/lib/types';

/**
 * Compact, non-interactive deck card for the Today screen. Shows cards progress
 * and today's log status at a glance; links to /japanese for logging, history,
 * pace, and the completion estimates.
 */
export default function AnkiSummary({ state }: { state: AnkiState }) {
  const paceAhead = state.paceDeltaCards >= 0;

  return (
    <SummaryCard
      title="Japanese"
      href="/japanese"
      pct={state.cardsPct * 100}
      complete={state.goalReached}
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
