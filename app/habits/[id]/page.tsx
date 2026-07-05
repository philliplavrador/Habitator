import Link from 'next/link';
import { notFound } from 'next/navigation';
import StatTile from '@/components/ui/StatTile';
import Heatmap from '@/components/Heatmap';
import HabitActions from '@/components/HabitActions';
import { getHabit } from '@/lib/habits';
import { listEntriesForHabit } from '@/lib/entries';
import { getHabitStats, formatRate } from '@/lib/stats';
import { formatHuman, todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';
import type { EntryStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function HabitDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const habit = getHabit(id);
  if (!habit) notFound();

  const stats = getHabitStats(id);
  const today = todayISO(getTimezone());

  const statusByDate: Record<string, EntryStatus> = {};
  for (const e of listEntriesForHabit(id)) statusByDate[e.date] = e.status;

  return (
    <main className="py-4">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border border-border text-text-secondary active:bg-surface2"
        >
          ‹
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-text-primary">
          {habit.name}
        </h1>
        {habit.archived === 1 && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
            Archived
          </span>
        )}
      </header>

      {(habit.details || habit.exceptions) && (
        <section className="mb-5 flex flex-col gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm">
          {habit.details && (
            <div>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-text-muted">
                Details
              </div>
              <p className="whitespace-pre-wrap text-text-secondary">
                {habit.details}
              </p>
            </div>
          )}
          {habit.exceptions && (
            <div>
              <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-text-muted">
                Exceptions
              </div>
              <p className="whitespace-pre-wrap text-text-secondary">
                {habit.exceptions}
              </p>
            </div>
          )}
        </section>
      )}

      <p className="mb-5 text-xs text-text-muted">
        Tracking since {formatHuman(habit.start_date)}
      </p>

      <section className="mb-3 grid grid-cols-3 gap-2">
        <StatTile label="Completion" value={formatRate(stats.completionRate)} />
        <StatTile
          label="Current streak"
          value={String(stats.currentStreak)}
          accent="pass"
        />
        <StatTile label="Longest streak" value={String(stats.longestStreak)} />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-2">
        <StatTile label="Passes" value={String(stats.passes)} accent="pass" />
        <StatTile label="Fails" value={String(stats.fails)} accent="fail" />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">
          Last 14 weeks
        </h2>
        <Heatmap
          statusByDate={statusByDate}
          startDate={habit.start_date}
          today={today}
        />
      </section>

      <HabitActions
        id={habit.id}
        name={habit.name}
        archived={habit.archived === 1}
      />
    </main>
  );
}
