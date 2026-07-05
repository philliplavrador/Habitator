import PushupCard from '@/components/PushupCard';
import StatTile from '@/components/ui/StatTile';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import { chart } from '@/components/charts/theme';
import { getPushupState, listPushupSessions } from '@/lib/pushups';
import {
  repVolumeSeries,
  completionTimeline,
  projectedFinish,
} from '@/lib/analytics';
import { todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function PushupsPage() {
  const tz = getTimezone();
  const today = todayISO(tz);
  const state = getPushupState(tz);

  const sessions = listPushupSessions();
  const volume = repVolumeSeries(sessions);
  const timeline = completionTimeline(sessions);
  const projection = projectedFinish(
    state.completedCount,
    state.programDays,
    sessions,
    today
  );

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="text-center font-display text-xl font-bold tracking-tight text-text-primary">
          Pushups
        </h1>
        <p className="mt-1 text-center text-xs text-text-muted">
          A {state.programDays}-day progression to 3 × 50.
        </p>
      </header>

      <PushupCard initialState={state} />

      {sessions.length > 0 && (
        <section className="mt-6 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Days done"
              value={String(state.completedCount)}
              sub={`of ${state.programDays}`}
              accent="pass"
            />
            <StatTile
              label="Projected finish"
              value={projection.etaDate ? projection.etaDate.slice(5) : '—'}
              sub={projection.daysToGo ? `~${projection.daysToGo} days` : 'keep logging'}
              accent="accent"
            />
          </div>
          <ChartCard title="Reps per session" subtitle="Total reps vs target">
            <LineTrend
              data={volume}
              xKey="n"
              yKey="volume"
              refKey="target"
              color={chart.accentTo}
              name="Reps"
            />
          </ChartCard>
          <ChartCard title="Days completed" subtitle="Cumulative over sessions" height="h-44">
            <LineTrend data={timeline} xKey="n" yKey="completed" color={chart.accentFrom} />
          </ChartCard>
        </section>
      )}
    </main>
  );
}
