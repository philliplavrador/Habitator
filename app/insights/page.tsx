import Link from 'next/link';
import StatTile from '@/components/ui/StatTile';
import Card from '@/components/ui/Card';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { chart } from '@/components/charts/theme';
import { listActiveHabits, listAllHabits } from '@/lib/habits';
import { getHabitStats, formatRate } from '@/lib/stats';
import { listAllEntries } from '@/lib/entries';
import { listFasts } from '@/lib/fasts';
import { computeFastStats } from '@/lib/fastStats';
import { getPushupState } from '@/lib/pushups';
import { cumulativePasses, dayOfWeekBreakdown, perfectDays } from '@/lib/analytics';
import { formatDuration, todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function weekdayColor(rate: number | null): string {
  if (rate === null) return '#2a2f3a';
  if (rate >= 67) return chart.pass;
  if (rate >= 34) return chart.warn;
  return chart.fail;
}

export default function InsightsPage() {
  const tz = getTimezone();
  const today = todayISO(tz);

  const habits = listActiveHabits();
  const rows = habits
    .map((habit) => ({ habit, stats: getHabitStats(habit.id) }))
    .sort((a, b) => {
      const ra = a.stats.completionRate ?? -1;
      const rb = b.stats.completionRate ?? -1;
      if (rb !== ra) return rb - ra;
      return b.stats.currentStreak - a.stats.currentStreak;
    });

  const passes = rows.reduce((s, r) => s + r.stats.passes, 0);
  const fails = rows.reduce((s, r) => s + r.stats.fails, 0);
  const overall = passes + fails === 0 ? null : passes / (passes + fails);
  const bestStreak = rows.reduce((m, r) => Math.max(m, r.stats.currentStreak), 0);

  // Cross-habit analytics.
  const allEntries = listAllEntries();
  const perfect = perfectDays(listAllHabits(), allEntries, today);
  const cumulative = cumulativePasses(allEntries).map((p) => ({
    label: p.date.slice(5),
    total: p.total,
  }));
  const dow = dayOfWeekBreakdown(allEntries).map((d) => ({
    ...d,
    fill: weekdayColor(d.rate),
  }));
  const byDay = new Map<string, { p: number; f: number }>();
  for (const e of allEntries) {
    const d = byDay.get(e.date) ?? { p: 0, f: 0 };
    if (e.status === 'pass') d.p++;
    else d.f++;
    byDay.set(e.date, d);
  }
  const dailyRate = [...byDay.keys()].sort().map((date) => {
    const { p, f } = byDay.get(date)!;
    return { label: date.slice(5), rate: p + f ? Math.round((p / (p + f)) * 100) : null };
  });

  const fastStats = computeFastStats(listFasts());
  const pushups = getPushupState(tz);

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="text-center font-display text-xl font-bold tracking-tight text-text-primary">
          Insights
        </h1>
        <p className="mt-1 text-center text-xs text-text-muted">
          Everything you&apos;re building, at a glance.
        </p>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2">
        <StatTile label="Win rate" value={formatRate(overall)} accent="pass" />
        <StatTile label="Perfect days" value={String(perfect.count)} accent="accent" />
        <StatTile label="Best streak" value={String(bestStreak)} sub="days" />
        <StatTile label="Active habits" value={String(habits.length)} />
      </section>

      <section className="mb-4 flex flex-col gap-3">
        <ChartCard title="Daily win rate" subtitle="Passes ÷ recorded, all habits">
          <LineTrend
            data={dailyRate}
            xKey="label"
            yKey="rate"
            unit="%"
            yDomain={[0, 100]}
            color={chart.accentTo}
          />
        </ChartCard>
        <ChartCard title="Momentum" subtitle="Total passes over time">
          <LineTrend data={cumulative} xKey="label" yKey="total" color={chart.accentFrom} />
        </ChartCard>
        <ChartCard title="Best days of the week" subtitle="Win rate per weekday" height="h-44">
          <BarBreakdown
            data={dow}
            xKey="label"
            yKey="rate"
            unit="%"
            fillKey="fill"
          />
        </ChartCard>
      </section>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-text-secondary">
          Habit leaderboard
        </h2>
        {rows.length === 0 ? (
          <Card>
            <p className="text-center text-sm text-text-muted">
              No habits yet. Add one on the Today screen to start building insights.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r, i) => (
              <li key={r.habit.id}>
                <Link
                  href={`/habits/${r.habit.id}`}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-3 shadow-card transition-colors active:bg-surface2"
                >
                  <span className="w-5 shrink-0 text-center font-display text-sm font-bold text-text-faint">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text-primary">
                    {r.habit.name}
                  </span>
                  {r.stats.currentStreak > 0 && (
                    <span className="shrink-0 text-xs text-text-muted">
                      🔥 {r.stats.currentStreak}
                    </span>
                  )}
                  <span className="shrink-0 font-display text-sm font-bold tabular-nums text-pass">
                    {formatRate(r.stats.completionRate)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <Link href="/fasts" className="block">
          <StatTile
            label="Avg fast"
            value={fastStats.avgHours === null ? '—' : formatDuration(fastStats.avgHours)}
            sub={`${fastStats.totalFasts} logged`}
          />
        </Link>
        <Link href="/pushups" className="block">
          <StatTile
            label="Pushup day"
            value={pushups.programComplete ? '✓' : String(pushups.currentDay)}
            sub={`of ${pushups.programDays}`}
            accent="accent"
          />
        </Link>
      </section>
    </main>
  );
}
