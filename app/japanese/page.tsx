import AnkiLogCard from '@/components/AnkiLogCard';
import AnkiHistory from '@/components/AnkiHistory';
import ProgressBar from '@/components/ProgressBar';
import Card from '@/components/ui/Card';
import StatTile from '@/components/ui/StatTile';
import ChartCard from '@/components/charts/ChartCard';
import LineTrend from '@/components/charts/LineTrend';
import { chart } from '@/components/charts/theme';
import { getAnkiState, listAnkiDays } from '@/lib/anki';
import { requireUserId } from '@/lib/auth';
import { ankiCumulativeSeries } from '@/lib/analytics';
import { formatHumanYear } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';
import type { AnkiState } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function JapanesePage() {
  const userId = await requireUserId();
  const tz = getTimezone();
  const state = await getAnkiState(userId, tz);
  const days = await listAnkiDays(userId);
  const series = ankiCumulativeSeries(
    days,
    state.startDate,
    state.today,
    state.dailyMin,
    state.goal
  );

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="text-center font-display text-xl font-bold tracking-tight text-text-primary">
          Japanese
        </h1>
        <p className="mt-1 text-center text-xs text-text-muted">
          {state.deckName} · {state.goal.toLocaleString()}-card goal ·{' '}
          {state.dailyMin}/day minimum
        </p>
      </header>

      <AnkiLogCard initialState={state} />

      <Timeline state={state} />

      <section className="mt-3 grid grid-cols-2 gap-2">
        <PaceTile state={state} />
        <StreakTile state={state} />
      </section>

      <section className="mt-2 grid grid-cols-2 gap-2">
        <FinishTile
          label="Min-pace finish"
          iso={state.baselineFinish}
          sub={`if ${state.dailyMin}/day · ~${state.totalPlanDays}d`}
        />
        <FinishTile
          label="Projected finish"
          iso={state.projectedFinish}
          sub={
            state.goalReached
              ? 'done 🎉'
              : `done + ${state.dailyMin}/day · ~${state.projectedDaysToGo}d`
          }
        />
      </section>

      {state.daysLogged > 0 && (
        <section className="mt-6">
          <ChartCard title="Cards over time" subtitle={`Cumulative vs ${state.dailyMin}/day pace`}>
            <LineTrend
              data={series}
              xKey="label"
              yKey="done"
              refKey="pace"
              color={chart.accentTo}
              name="Done"
            />
          </ChartCard>
        </section>
      )}

      <AnkiHistory
        days={days}
        dailyMin={state.dailyMin}
        startDate={state.startDate}
        today={state.today}
      />
    </main>
  );
}

// ── Presentational tiles (server) ───────────────────────────────────

/** The "progress bar of days left" — calendar progress through the min-pace plan. */
function Timeline({ state }: { state: AnkiState }) {
  if (state.goalReached) {
    return (
      <Card padding="p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-text-secondary">Timeline</h3>
          <span className="text-xs font-semibold text-pass">Complete 🎉</span>
        </div>
        <ProgressBar value={1} tone="pass" />
        <p className="mt-2 text-xs text-text-muted">
          Goal complete — all {state.goal.toLocaleString()} cards done.
        </p>
      </Card>
    );
  }
  return (
    <Card padding="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-text-secondary">Timeline</h3>
        <span className="text-xs font-semibold tabular-nums text-text-primary">
          {state.daysLeftPlan.toLocaleString()} days left
        </span>
      </div>
      <ProgressBar value={state.planPct} />
      <p className="mt-2 text-xs text-text-muted">
        Day {state.daysElapsed.toLocaleString()} of{' '}
        {state.totalPlanDays.toLocaleString()} · min-pace plan finishes{' '}
        {formatHumanYear(state.baselineFinish)}
      </p>
    </Card>
  );
}

/** Ahead-of / behind-pace, assuming the 10/day baseline. */
function PaceTile({ state }: { state: AnkiState }) {
  const delta = state.paceDeltaCards;
  const onPace = delta === 0;
  const ahead = delta > 0;
  const value = onPace ? 'On pace' : `${ahead ? '+' : ''}${delta.toLocaleString()}`;
  const accent = onPace ? 'accent' : ahead ? 'pass' : 'fail';
  const dir = ahead ? 'ahead' : 'behind';
  const days = Math.abs(state.paceDeltaDays);
  const cards = Math.abs(delta);
  // Below a full day's worth, phrase the gap in cards so it never reads "0 days".
  const sub = onPace
    ? 'right on the line'
    : days === 0
      ? `${cards} ${cards === 1 ? 'card' : 'cards'} ${dir}`
      : `${days} ${days === 1 ? 'day' : 'days'} ${dir}`;
  return <StatTile label={`Pace vs ${state.dailyMin}/day`} value={value} sub={sub} accent={accent} />;
}

/** The streak widget — consecutive days meeting the daily minimum. */
function StreakTile({ state }: { state: AnkiState }) {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-4 text-center shadow-card">
      <div className="mb-1 text-xl leading-none" aria-hidden="true">
        🔥
      </div>
      <div className="font-display text-2xl font-bold tabular-nums text-text-primary">
        {state.currentStreak}
      </div>
      <div className="mt-1 text-xs text-text-muted">day streak</div>
      <div className="mt-0.5 text-[11px] text-text-faint">
        longest {state.longestStreak} · ≥{state.dailyMin}/day
      </div>
    </div>
  );
}

/** A completion-estimate tile: a compact date value + a year/basis sub-line. */
function FinishTile({
  label,
  iso,
  sub,
}: {
  label: string;
  iso: string | null;
  sub: string;
}) {
  const [monthDay, year] = iso ? formatHumanYear(iso).split(', ') : ['—', ''];
  return (
    <StatTile
      label={label}
      value={monthDay}
      sub={year ? `${year} · ${sub}` : sub}
      accent="accent"
    />
  );
}
