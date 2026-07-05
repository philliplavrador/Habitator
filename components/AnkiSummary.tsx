import Link from 'next/link';
import ProgressBar from './ProgressBar';
import type { AnkiState } from '@/lib/types';

/**
 * Compact, non-interactive deck card for the Today screen. Shows cards progress
 * and today's log status at a glance; links to /japanese for logging, history,
 * pace, and the completion estimates.
 */
export default function AnkiSummary({ state }: { state: AnkiState }) {
  const paceAhead = state.paceDeltaCards >= 0;

  return (
    <Link
      href="/japanese"
      className="mb-4 block rounded-card border border-border bg-surface p-4 shadow-card transition-colors active:bg-surface2"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-base font-bold text-text-primary">Japanese</h2>
        <span className="text-xs font-semibold text-accent-400">
          {state.goalReached ? 'Complete 🎉' : `${Math.floor(state.cardsPct * 100)}%`}
        </span>
      </div>

      <ProgressBar value={state.cardsPct} tone={state.goalReached ? 'pass' : 'accent'} />

      <div className="mt-2 flex items-center justify-between text-xs">
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
        <span className="font-semibold text-accent-400">Open →</span>
      </div>
    </Link>
  );
}
