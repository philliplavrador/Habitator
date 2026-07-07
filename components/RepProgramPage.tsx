import type { ReactNode } from 'react';
import RepProgramCard from '@/components/RepProgramCard';
import RepProgramHistory from '@/components/RepProgramHistory';
import SessionHeatmap from '@/components/SessionHeatmap';
import StatTile from '@/components/ui/StatTile';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import { chart } from '@/components/charts/theme';
import { requirePageContext } from '@/lib/pageContext';
import {
  repVolumeSeries,
  completionTimeline,
  projectedFinish,
  sessionHeatmap,
} from '@/lib/analytics';
import type { RepProgramState, RepSession } from '@/lib/types';

interface RepProgramPageProps {
  /** Fetches the program state for a user (scoped by user_id), in their tz. */
  getState: (userId: number, tz: string) => Promise<RepProgramState>;
  /** Lists the user's sessions (scoped by user_id). */
  listSessions: (userId: number) => Promise<RepSession[]>;
  /** The page heading. */
  title: string;
  /** The subtitle sentence, built from the fetched state (per-page copy). */
  subtitle: (state: RepProgramState) => ReactNode;
  /** Optional footer actions (e.g. edit/delete for a user-defined program). */
  actions?: ReactNode;
}

/**
 * The shared shell for a rep-program screen (pushups, pullups): header, the
 * live card, stat tiles, the "every day" heatmap, the two trend charts, and the
 * editable history. Parameterized only by the program's data-fetchers and its
 * per-page title/subtitle so both screens render identically to their originals.
 */
export default async function RepProgramPage({
  getState,
  listSessions,
  title,
  subtitle,
  actions,
}: RepProgramPageProps) {
  const { userId, tz, today } = await requirePageContext();
  const state = await getState(userId, tz);

  const sessions = await listSessions(userId);
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
          {title}
        </h1>
        <p className="mt-1 text-center text-xs text-text-muted">
          {subtitle(state)}
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

      <RepProgramHistory basePath={state.basePath} sessions={sessions} />

      {actions}
    </main>
  );
}
