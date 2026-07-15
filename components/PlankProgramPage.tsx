import type { ReactNode } from 'react';
import PlankProgramCard from '@/components/PlankProgramCard';
import PlankProgramHistory from '@/components/PlankProgramHistory';
import PlankRecordings from '@/components/PlankRecordings';
import SessionHeatmap from '@/components/SessionHeatmap';
import StatTile from '@/components/ui/StatTile';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import { chart } from '@/components/charts/theme';
import { requirePageContext } from '@/lib/pageContext';
import {
  plankHoldSeries,
  completionTimeline,
  projectedFinish,
  sessionHeatmap,
} from '@/lib/analytics';
import type { PlankProgramState, PlankSession } from '@/lib/types';

interface PlankProgramPageProps {
  /** Fetches the program state for a user (scoped by user_id), in their tz. */
  getState: (userId: number, tz: string) => Promise<PlankProgramState>;
  /** Lists the user's sessions (scoped by user_id). */
  listSessions: (userId: number) => Promise<PlankSession[]>;
  /** The page heading. */
  title: string;
  /** The subtitle sentence, built from the fetched state (per-page copy). */
  subtitle: (state: PlankProgramState) => ReactNode;
  /** Footer actions (edit/delete for the program). */
  actions?: ReactNode;
}

/**
 * The screen shell for a plank program: header, the live card, past-recordings
 * gallery, stat tiles, the "every day" heatmap, the two trend charts, and the
 * editable history. Mirrors RepProgramPage, but for a single timed hold per day.
 */
export default async function PlankProgramPage({
  getState,
  listSessions,
  title,
  subtitle,
  actions,
}: PlankProgramPageProps) {
  const { userId, tz, today } = await requirePageContext();
  const state = await getState(userId, tz);

  const sessions = await listSessions(userId);
  const holds = plankHoldSeries(sessions);
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
          {title}
        </h1>
        <p className="mt-1 text-center text-xs text-text-muted">
          {subtitle(state)}
        </p>
      </header>

      <PlankProgramCard initialState={state} />

      <PlankRecordings basePath={state.basePath} sessions={sessions} />

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

          <ChartCard title="Seconds held per session" subtitle="Time held vs target">
            <LineTrend
              data={holds}
              xKey="n"
              yKey="held"
              refKey="target"
              color={chart.accentTo}
              name="Seconds"
            />
          </ChartCard>
          <ChartCard title="Days completed" subtitle="Cumulative over sessions" height="h-44">
            <LineTrend data={timeline} xKey="n" yKey="completed" color={chart.accentFrom} />
          </ChartCard>
        </section>
      )}

      <PlankProgramHistory basePath={state.basePath} sessions={sessions} />

      {actions}
    </main>
  );
}
