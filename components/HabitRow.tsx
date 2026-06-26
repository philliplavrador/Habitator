'use client';

import Link from 'next/link';
import type { EntryStatus, HabitDayView } from '@/lib/types';

interface Props {
  view: HabitDayView;
  busy?: boolean;
  /** Called with the desired new state: 'pass', 'fail', or null to clear. */
  onSetStatus: (next: EntryStatus | null) => void;
}

export default function HabitRow({ view, busy, onSetStatus }: Props) {
  const { habit, status, currentStreak } = view;

  const tapPass = () => onSetStatus(status === 'pass' ? null : 'pass');
  const tapFail = () => onSetStatus(status === 'fail' ? null : 'fail');

  return (
    <li className="flex items-center gap-3 rounded-card bg-surface border border-border px-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/habits/${habit.id}`}
          className="block truncate text-[15px] font-medium text-text-primary active:opacity-70"
        >
          {habit.name}
        </Link>
        {currentStreak > 0 && (
          <span className="mt-0.5 inline-block text-xs text-text-muted">
            🔥 {currentStreak}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="Mark pass"
          aria-pressed={status === 'pass'}
          disabled={busy}
          onClick={tapPass}
          className={[
            'flex h-11 w-11 items-center justify-center rounded-btn border text-lg transition-colors disabled:opacity-50',
            status === 'pass'
              ? 'border-pass bg-pass text-black'
              : 'border-border bg-surface2 text-text-muted active:border-pass',
          ].join(' ')}
        >
          ✓
        </button>
        <button
          type="button"
          aria-label="Mark fail"
          aria-pressed={status === 'fail'}
          disabled={busy}
          onClick={tapFail}
          className={[
            'flex h-11 w-11 items-center justify-center rounded-btn border text-lg transition-colors disabled:opacity-50',
            status === 'fail'
              ? 'border-fail bg-fail text-white'
              : 'border-border bg-surface2 text-text-muted active:border-fail',
          ].join(' ')}
        >
          ✗
        </button>
      </div>
    </li>
  );
}
