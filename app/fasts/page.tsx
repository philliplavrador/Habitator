import FastClient from '@/components/FastClient';
import FastHistory from '@/components/FastHistory';
import Footer from '@/components/Footer';
import StatTile from '@/components/ui/StatTile';
import ChartCard from '@/components/charts/ChartCard';
import BarBreakdown from '@/components/charts/BarBreakdown';
import { chart } from '@/components/charts/theme';
import { listFasts } from '@/lib/fasts';
import { requirePageContext } from '@/lib/pageContext';
import { computeFastStats } from '@/lib/fastStats';
import {
  fastDurationSeries,
  durationHistogram,
  startHourDistribution,
  consecutiveFastingStreak,
} from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FastsPage() {
  const { userId, tz, today } = await requirePageContext();
  const fasts = await listFasts(userId);
  // listFasts orders the (at most one, per the uniq_fast_active index) in-progress
  // fast first — `ORDER BY (end_at IS NULL) DESC, …` — so the active fast, if any,
  // is fasts[0]. This is exactly getActiveFast's result (WHERE end_at IS NULL
  // LIMIT 1), derived without the extra round-trip.
  const active = fasts[0] && fasts[0].end_at === null ? fasts[0] : null;
  const stats = computeFastStats(fasts);

  const durations = fastDurationSeries(fasts, tz).map((d) => ({
    ...d,
    fill: d.hit ? chart.pass : chart.accent,
  }));
  const histogram = durationHistogram(fasts);
  const startHours = startHourDistribution(fasts, tz);
  const streak = consecutiveFastingStreak(fasts, tz, today);

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="text-center font-display text-xl font-bold tracking-tight text-text-primary">
          Fasting
        </h1>
      </header>

      <FastClient active={active} tz={tz} />

      {durations.length > 0 && (
        <section className="mt-8 flex flex-col gap-3">
          <h2 className="text-base font-bold text-text-primary">Trends</h2>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Fasting streak"
              value={String(streak.current)}
              sub="days in a row"
              accent="accent"
            />
            <StatTile label="Longest streak" value={String(streak.longest)} sub="days" />
          </div>
          <ChartCard title="Fast durations" subtitle="Hours per completed fast">
            <BarBreakdown
              data={durations}
              xKey="label"
              yKey="hours"
              unit="h"
              fillKey="fill"
            />
          </ChartCard>
          <ChartCard title="Duration distribution" height="h-44">
            <BarBreakdown data={histogram} xKey="label" yKey="count" />
          </ChartCard>
          <ChartCard title="When you start" subtitle="Fasts started by hour" height="h-44">
            <BarBreakdown data={startHours} xKey="label" yKey="count" />
          </ChartCard>
        </section>
      )}

      <FastHistory fasts={fasts} stats={stats} tz={tz} />

      <Footer />
    </main>
  );
}
