'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProgressRing from './ProgressRing';
import { apiEndFast, apiStartFast } from '@/lib/client';
import {
  formatDateTime,
  formatDuration,
  formatElapsed,
  nowISO,
} from '@/lib/dates';
import type { Fast } from '@/lib/types';

interface Props {
  active: Fast | null;
}

const GOAL_PRESETS = [13, 16, 18, 20, 24];

export default function FastClient({ active }: Props) {
  if (active) return <ActiveFast fast={active} />;
  return <StartFast />;
}

// ── In-progress view: ring + live timer ─────────────────────────────

function ActiveFast({ fast }: { fast: Fast }) {
  const router = useRouter();
  const startMs = Date.parse(fast.start_at);

  // Initialize deterministically (elapsed 0) so SSR and first client render
  // match; the interval below advances it to the real clock right after mount.
  const [nowMs, setNowMs] = useState(startMs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick(); // jump to real elapsed immediately on mount
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const goalSec = fast.goal_hours * 3600;
  const reached = elapsedSec >= goalSec;
  const progress = goalSec > 0 ? elapsedSec / goalSec : 0;
  const overageSec = elapsedSec - goalSec;

  async function handleStop() {
    setBusy(true);
    setError(null);
    try {
      await apiEndFast(fast.id, nowISO());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not end the fast.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <ProgressRing progress={progress} reached={reached}>
        <div className="font-mono text-3xl font-bold tabular-nums text-text-primary">
          {formatElapsed(elapsedSec)}
        </div>
        <div className="mt-1 text-xs text-text-muted">
          Goal {formatDuration(fast.goal_hours)}
        </div>
        {reached ? (
          <div className="mt-1 text-xs font-semibold text-pass">
            Goal reached · +{formatElapsed(overageSec)}
          </div>
        ) : (
          <div className="mt-1 text-xs text-text-muted">
            {Math.floor(progress * 100)}% of goal
          </div>
        )}
      </ProgressRing>

      <p className="text-sm text-text-muted" suppressHydrationWarning>
        Started {formatDateTime(fast.start_at)}
      </p>

      {error && (
        <p className="w-full rounded-btn bg-fail/15 px-3 py-2 text-center text-sm text-fail">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleStop}
        disabled={busy}
        className="w-full rounded-btn border border-fail/40 px-4 py-3 text-center font-semibold text-fail active:bg-fail/10 disabled:opacity-50"
      >
        {busy ? 'Ending…' : 'End fast'}
      </button>
    </div>
  );
}

// ── Idle view: pick a goal and start ────────────────────────────────

function StartFast() {
  const router = useRouter();
  const [goal, setGoal] = useState<number>(16);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A non-empty custom value overrides the preset selection.
  const customNum = custom.trim() === '' ? null : Number(custom);
  const effectiveGoal =
    customNum !== null && Number.isFinite(customNum) ? customNum : goal;

  async function handleStart() {
    if (!Number.isFinite(effectiveGoal) || effectiveGoal <= 0) {
      setError('Enter a valid goal in hours.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiStartFast({ goal_hours: effectiveGoal });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the fast.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-card border border-border bg-surface p-5 text-center">
        <p className="text-text-secondary">No fast in progress.</p>
        <p className="mt-1 text-sm text-text-muted">
          Pick a goal and start when you begin.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-text-secondary">Goal</p>
        <div className="grid grid-cols-5 gap-2">
          {GOAL_PRESETS.map((h) => {
            const selected = customNum === null && goal === h;
            return (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setGoal(h);
                  setCustom('');
                }}
                className={`rounded-btn border px-2 py-2.5 text-sm font-semibold transition-colors ${
                  selected
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface text-text-secondary active:bg-surface2'
                }`}
              >
                {h}h
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="custom-goal" className="mb-1.5 block text-sm font-medium text-text-secondary">
          Custom goal (hours)
        </label>
        <input
          id="custom-goal"
          type="number"
          inputMode="decimal"
          min={1}
          max={168}
          step="0.5"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="e.g. 36"
          className="w-full rounded-btn border border-border bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted outline-none focus:border-accent"
        />
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <button
        type="button"
        onClick={handleStart}
        disabled={busy}
        className="rounded-btn bg-accent px-4 py-3.5 text-center text-base font-semibold text-white active:bg-accent-soft disabled:opacity-50"
      >
        {busy ? 'Starting…' : `Start ${formatDuration(effectiveGoal)} fast`}
      </button>
    </div>
  );
}
