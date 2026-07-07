import RepProgramCard from '@/components/RepProgramCard';
import RepProgramHistory from '@/components/RepProgramHistory';
import SessionHeatmap from '@/components/SessionHeatmap';
import StatTile from '@/components/ui/StatTile';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import { chart } from '@/components/charts/theme';
import { getPullupState, listPullupSessions } from '@/lib/pullups';
import { requireUserId } from '@/lib/auth';
import {
  repVolumeSeries,
  completionTimeline,
  projectedFinish,
  sessionHeatmap,
} from '@/lib/analytics';
import { todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PullupsPage() {
  const userId = await requireUserId();
  const tz = getTimezone();
  const today = todayISO(tz);
  const state = await getPullupState(userId, tz);

  const sessions = await listPullupSessions(userId);
  const volume = repVolumeSeries(sessions);
  const timeline = completionTimeline(sessions);
  const projection = projectedFinish(
    state.completedCount,
    state.programDays,
    sessions,
    today
  );
  const heatmap = sessionHeatmap(sessions);

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="text-center font-display text-xl font-bold tracking-tight text-text-primary">
          Pullups
        </h1>
        <p className="mt-1 text-center text-xs text-text-muted">
          A {state.programDays}-day progression from 3 × 5 to {state.finishLabel}.
        </p>
      </header>

      <RepProgramCard initialState={state} />

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
            <StatTile
              label="Current streak"
              value={String(state.currentStreak)}
              sub="days attempted"
              accent="accent"
            />
            <StatTile
              label="Longest streak"
              value={String(state.longestStreak)}
              sub="days"
            />
          </div>

          {heatmap.startDate && (
            <section className="rounded-card border border-border bg-surface p-4 shadow-card">
              <h2 className="mb-3 text-sm font-semibold text-text-secondary">
                Every day
              </h2>
              <SessionHeatmap
                statusByDate={heatmap.statusByDate}
                startDate={heatmap.startDate}
                today={today}
              />
            </section>
          )}

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

      <RepProgramHistory program={state.key} sessions={sessions} />
    </main>
  );
}
