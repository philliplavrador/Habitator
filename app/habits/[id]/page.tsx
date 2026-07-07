import BackHeader from '@/components/BackHeader';
import StatTile from '@/components/ui/StatTile';
import Heatmap from '@/components/Heatmap';
import HabitCalendar from '@/components/HabitCalendar';
import HabitActions from '@/components/HabitActions';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { chart, weekdayColor } from '@/components/charts/theme';
import { loadHabitOr404 } from '@/lib/habitPage';
import { listEntriesForHabit, listEntriesForHabitSince } from '@/lib/entries';
import { getHabitStats, formatRate } from '@/lib/stats';
import { requirePageContext } from '@/lib/pageContext';
import { rollingCompletionSeries, dayOfWeekBreakdown } from '@/lib/analytics';
import { formatHuman } from '@/lib/dates';
import { describeSchedule } from '@/lib/schedule';
import type { EntryStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HabitDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId, today } = await requirePageContext();
  const habit = await loadHabitOr404(params.id, userId);
  const isQuit = habit.kind === 'quit';
  const sk = habit.schedule.kind;
  const isWeekly = sk === 'weekly';
  const isScheduled = sk === 'weekdays' || sk === 'interval';
  const isDailyBuild = !isQuit && sk === 'daily';

  // Stat-tile labels adapt to the habit's kind + schedule (quit → clean/slips;
  // weekly → weeks; strict scheduled → done/misses; daily → passes/fails).
  const rateLabel = isQuit ? 'Clean rate' : isWeekly ? 'Weekly rate' : 'Completion';
  const streakLabel = isQuit
    ? 'Clean streak'
    : isWeekly
      ? 'Week streak'
      : 'Current streak';
  const passLabel = isQuit ? 'Clean days' : isWeekly ? 'Weeks hit' : 'Passes';
  const failLabel = isQuit
    ? 'Slips'
    : isWeekly
      ? 'Weeks missed'
      : isScheduled
        ? 'Misses'
        : 'Fails';

  const stats = await getHabitStats(userId, habit.id, today);

  const statusByDate: Record<string, EntryStatus> = {};
  for (const e of await listEntriesForHabit(userId, habit.id)) {
    statusByDate[e.date] = e.status;
  }

  // Analytics over recorded days on/after the start date.
  const since = await listEntriesForHabitSince(userId, habit.id, habit.start_date);
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
      <BackHeader
        href="/"
        title={habit.name}
        className="mb-5"
        right={
          habit.archived === 1 ? (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
              Archived
            </span>
          ) : (
            <></>
          )
        }
      />

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
        {!isQuit && sk !== 'daily' && (
          <>{describeSchedule(habit.schedule)} · </>
        )}
        Tracking since {formatHuman(habit.start_date)}
      </p>

      <section className="mb-3 grid grid-cols-3 gap-2">
        <StatTile label={rateLabel} value={formatRate(stats.completionRate)} />
        <StatTile
          label={streakLabel}
          value={String(stats.currentStreak)}
          accent="pass"
        />
        <StatTile label="Longest streak" value={String(stats.longestStreak)} />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-2">
        <StatTile label={passLabel} value={String(stats.passes)} accent="pass" />
        <StatTile label={failLabel} value={String(stats.fails)} accent="fail" />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">
          Last 14 weeks
        </h2>
        <Heatmap
          statusByDate={statusByDate}
          startDate={habit.start_date}
          today={today}
          kind={habit.kind}
          schedule={habit.schedule}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">
          Edit days
        </h2>
        <div className="rounded-card border border-border bg-surface p-3 shadow-card">
          <HabitCalendar
            habitId={habit.id}
            initialStatus={statusByDate}
            startDate={habit.start_date}
            today={today}
            kind={habit.kind}
            schedule={habit.schedule}
          />
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {isQuit
            ? 'Days are clean by default — tap a day to mark a slip, or clear it back to clean.'
            : isScheduled
              ? 'Faint days are off-schedule. Tap any day to mark it pass, fail, or clear it.'
              : 'Tap any day to mark it pass, fail, or clear it back to an exception.'}
        </p>
      </section>

      {isDailyBuild && since.length > 0 && (
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
