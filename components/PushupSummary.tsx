import Link from 'next/link';
import ProgressBar from './ProgressBar';
import type { PushupState } from '@/lib/types';

/**
 * Compact, non-interactive pushup card for the Today screen. Shows program
 * progress at a glance and links to the full /pushups screen for logging,
 * history, and charts.
 */
export default function PushupSummary({ state }: { state: PushupState }) {
  const pct = state.completedCount / state.programDays;
  const done = state.doneToday !== null;

  return (
    <Link
      href="/pushups"
      className="mb-4 block rounded-card border border-border bg-surface p-4 shadow-card transition-colors active:bg-surface2"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-base font-bold text-text-primary">Pushups</h2>
        <span className="text-xs font-semibold text-accent-400">
          {state.programComplete
            ? 'Complete 🎉'
            : `Day ${state.currentDay} of ${state.programDays}`}
        </span>
      </div>

      <ProgressBar value={pct} tone={state.programComplete ? 'pass' : 'accent'} />

      <div className="mt-2 flex items-center justify-between text-xs">
        {state.programComplete ? (
          <span className="text-text-secondary">All {state.programDays} days done 💪</span>
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
        <span className="font-semibold text-accent-400">Open →</span>
      </div>
    </Link>
  );
}
