'use client';

import Link from 'next/link';
import { m } from 'framer-motion';
import { describeSchedule } from '@/lib/schedule';
import type { EntryStatus, HabitDayView } from '@/lib/types';

interface Props {
  view: HabitDayView;
  busy?: boolean;
  /** Called with the desired new state: 'pass', 'fail', or null to clear. */
  onSetStatus: (next: EntryStatus | null) => void;
  /** Open the reason prompt to mark this day as a rest-day exception. */
  onMarkException?: () => void;
  /** Clear the rest-day exception (un-excuse this day). */
  onClearException?: () => void;
}

const tap = { scale: 0.86 };
const spring = { type: 'spring', stiffness: 420, damping: 16 } as const;

/** Shared row shell: the habit name link + an optional sub-line under it. */
function RowShell({
  href,
  name,
  sub,
  children,
}: {
  href: string;
  name: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-3 shadow-card">
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-[15px] font-medium text-text-primary active:opacity-70"
        >
          {name}
        </Link>
        {sub}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}

export default function HabitRow({
  view,
  busy,
  onSetStatus,
  onMarkException,
  onClearException,
}: Props) {
  const { habit, status, currentStreak, weekly } = view;
  const href = `/habits/${habit.id}`;

  // ── Rest-day exception: the day is excused, so it drops out of "to do" and
  // shows a single neon-pink toggle to undo it. Applies to any kind. ──
  if (view.excepted) {
    const reason = view.exceptionReason;
    const sub = (
      <span className="mt-0.5 inline-block text-xs font-medium text-exception">
        ◆ Rest day{reason ? ` — ${reason}` : ''}
      </span>
    );
    return (
      <RowShell href={href} name={habit.name} sub={sub}>
        <m.button
          type="button"
          aria-label="Undo rest day"
          aria-pressed
          disabled={busy}
          onClick={() => onClearException?.()}
          whileTap={tap}
          transition={spring}
          className="flex h-11 items-center justify-center rounded-btn border border-exception bg-exception px-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Rest
        </m.button>
      </RowShell>
    );
  }

  // A small neon-pink diamond that opens the reason prompt to excuse the day.
  const restButton = onMarkException ? (
    <m.button
      type="button"
      aria-label="Mark a rest day"
      disabled={busy}
      onClick={() => onMarkException()}
      whileTap={tap}
      transition={spring}
      className="flex h-11 w-11 items-center justify-center rounded-btn border border-border bg-surface2 text-sm text-text-muted active:border-exception active:text-exception disabled:opacity-50"
    >
      ◆
    </m.button>
  ) : null;

  // ── Quit habit: clean by default; only an explicit slip fails it. ──
  if (habit.kind === 'quit') {
    const slipped = status === 'fail';
    const sub = slipped ? (
      <span className="mt-0.5 inline-block text-xs font-medium text-fail">
        Slipped today
      </span>
    ) : currentStreak > 0 ? (
      <span className="mt-0.5 inline-block text-xs text-text-muted">
        🔥 {currentStreak} clean
      </span>
    ) : (
      <span className="mt-0.5 inline-block text-xs text-text-muted">On track</span>
    );

    return (
      <RowShell href={href} name={habit.name} sub={sub}>
        <m.button
          type="button"
          aria-label={slipped ? 'Undo slip' : 'Mark a slip'}
          aria-pressed={slipped}
          disabled={busy}
          onClick={() => onSetStatus(slipped ? null : 'fail')}
          whileTap={tap}
          transition={spring}
          className={[
            'flex h-11 items-center justify-center rounded-btn border px-3 text-sm font-semibold disabled:opacity-50',
            slipped
              ? 'border-fail bg-fail text-white'
              : 'border-border bg-surface2 text-text-secondary active:border-fail active:text-fail',
          ].join(' ')}
        >
          {slipped ? 'Undo' : 'I slipped'}
        </m.button>
      </RowShell>
    );
  }

  // ── Build habit: check it off each day (pass), or mark an explicit fail. ──
  const tapPass = () => onSetStatus(status === 'pass' ? null : 'pass');
  const tapFail = () => onSetStatus(status === 'fail' ? null : 'fail');

  // Sub-line: weekly progress (weekly habits), the streak, and a schedule hint
  // for fixed-day/interval habits so it's clear which days they're expected.
  const scheduleHint =
    habit.schedule.kind === 'weekdays' || habit.schedule.kind === 'interval'
      ? describeSchedule(habit.schedule)
      : null;
  const weekMet = weekly ? weekly.done >= weekly.target : false;
  const sub =
    weekly || currentStreak > 0 || scheduleHint ? (
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
        {weekly && (
          <span className={weekMet ? 'font-medium text-pass' : ''}>
            {weekly.done}/{weekly.target} this week
          </span>
        )}
        {currentStreak > 0 && <span>🔥 {currentStreak}</span>}
        {scheduleHint && <span>{scheduleHint}</span>}
      </span>
    ) : undefined;

  return (
    <RowShell href={href} name={habit.name} sub={sub}>
      {restButton}
      <m.button
        type="button"
        aria-label="Mark pass"
        aria-pressed={status === 'pass'}
        disabled={busy}
        onClick={tapPass}
        whileTap={tap}
        transition={spring}
        className={[
          'flex h-11 w-11 items-center justify-center rounded-btn border text-lg disabled:opacity-50',
          status === 'pass'
            ? 'border-pass bg-pass text-black shadow-glow-pass'
            : 'border-border bg-surface2 text-text-muted active:border-pass',
        ].join(' ')}
      >
        ✓
      </m.button>
      <m.button
        type="button"
        aria-label="Mark fail"
        aria-pressed={status === 'fail'}
        disabled={busy}
        onClick={tapFail}
        whileTap={tap}
        transition={spring}
        className={[
          'flex h-11 w-11 items-center justify-center rounded-btn border text-lg disabled:opacity-50',
          status === 'fail'
            ? 'border-fail bg-fail text-white'
            : 'border-border bg-surface2 text-text-muted active:border-fail',
        ].join(' ')}
      >
        ✗
      </m.button>
    </RowShell>
  );
}
