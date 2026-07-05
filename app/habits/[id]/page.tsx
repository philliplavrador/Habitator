import Link from 'next/link';
import { notFound } from 'next/navigation';
import StatTile from '@/components/ui/StatTile';
import Heatmap from '@/components/Heatmap';
import HabitActions from '@/components/HabitActions';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { chart } from '@/components/charts/theme';
import { getHabit } from '@/lib/habits';
import { listEntriesForHabit, listEntriesForHabitSince } from '@/lib/entries';
import { getHabitStats, formatRate } from '@/lib/stats';
import { rollingCompletionSeries, dayOfWeekBreakdown } from '@/lib/analytics';
import { formatHuman, todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';
import type { EntryStatus } from '@/lib/types';

function weekdayColor(rate: number | null): string {
  if (rate === null) return '#2a2f3a';
  if (rate >= 67) return chart.pass;
  if (rate >= 34) return chart.warn;
  return chart.fail;
}

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

  // Analytics over recorded days on/after the start date.
  const since = listEntriesForHabitSince(id, habit.start_date);
  const trend = rollingCompletionSeries(since, 14).map((p) => ({
    label: p.date.slice(5),
    rate: p.rate,
  }));
  const dow = dayOfWeekBreakdown(since).map((d) => ({
    ...d,
    fill: weekdayColor(d.rate),
  }));

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

      {since.length > 0 && (
        <section className="mb-6 flex flex-col gap-3">
          <ChartCard title="Completion trend" subtitle="14-day rolling win rate">
            <LineTrend
              data={trend}
              xKey="label"
              yKey="rate"
              unit="%"
              yDomain={[0, 100]}
              color={chart.accentTo}
            />
          </ChartCard>
          <ChartCard title="By day of week" subtitle="Win rate per weekday" height="h-44">
            <BarBreakdown
              data={dow}
              xKey="label"
              yKey="rate"
              unit="%"
              fillKey="fill"
            />
          </ChartCard>
        </section>
      )}

      <HabitActions
        id={habit.id}
        name={habit.name}
        archived={habit.archived === 1}
      />
    </main>
  );
}
