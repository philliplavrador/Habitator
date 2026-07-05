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
  toLocalInputValue,
} from '@/lib/dates';
import type { Fast } from '@/lib/types';
import { useCelebration } from './hooks/useCelebration';
import { useToast } from './ui/toast';
import Button from './ui/Button';
import Card from './ui/Card';
import { Field } from './ui/Field';
import SegmentedControl from './ui/SegmentedControl';

interface Props {
  active: Fast | null;
  /** Owner's timezone (resolved on the server) for all wall-clock display. */
  tz: string;
}

// Fire the goal-reached burst at most once per fast per session.
const celebratedFasts = new Set<number>();

const HOUR_MS = 3_600_000;
const DEFAULT_WINDOW_H = 16;
const MIN_HOURS = 1;
const MAX_HOURS = 168;

export default function FastClient({ active, tz }: Props) {
  if (active) return <ActiveFast fast={active} tz={tz} />;
  return <StartOrLog tz={tz} />;
}

// ── In-progress view: ring + live timer ─────────────────────────────

function ActiveFast({ fast, tz }: { fast: Fast; tz: string }) {
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
  const targetEndISO = new Date(startMs + fast.goal_hours * HOUR_MS).toISOString();

  // Celebrate crossing the goal — once per fast per session.
  const { burst } = useCelebration();
  const { show } = useToast();
  useEffect(() => {
    if (reached && !celebratedFasts.has(fast.id)) {
      celebratedFasts.add(fast.id);
      burst();
      show({
        tone: 'success',
        title: 'Goal reached! 🎯',
        description: `You passed your ${formatDuration(fast.goal_hours)} goal.`,
      });
    }
  }, [reached, fast.id, fast.goal_hours, burst, show]);

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

      <div className="text-center text-sm text-text-muted">
        <p>Started {formatDateTime(fast.start_at, tz)}</p>
        <p>Target {formatDateTime(targetEndISO, tz)}</p>
      </div>

      {error && (
        <p className="w-full rounded-btn bg-fail/15 px-3 py-2 text-center text-sm text-fail">
          {error}
        </p>
      )}

      <Button variant="danger" size="lg" fullWidth onClick={handleStop} loading={busy}>
        {busy ? 'Ending…' : 'End fast'}
      </Button>
    </div>
  );
}

// ── Idle view: start a live fast, or log a completed one ────────────

type Mode = 'start' | 'log';

function StartOrLog({ tz }: { tz: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('start');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed sensible defaults on the client only — computing "now" during SSR
  // would bake in the server timezone/clock and cause a hydration mismatch.
  // Start mode: now → now + 16h target. Log mode: 16h ago → now.
  useEffect(() => {
    const now = Date.now();
    if (mode === 'start') {
      setStart(toLocalInputValue(new Date(now).toISOString(), tz));
      setEnd(toLocalInputValue(new Date(now + DEFAULT_WINDOW_H * HOUR_MS).toISOString(), tz));
    } else {
      setStart(toLocalInputValue(new Date(now - DEFAULT_WINDOW_H * HOUR_MS).toISOString(), tz));
      setEnd(toLocalInputValue(new Date(now).toISOString(), tz));
    }
    setError(null);
  }, [mode, tz]);

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const durationH =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? (endMs - startMs) / HOUR_MS
      : NaN;
  const durationOk =
    Number.isFinite(durationH) && durationH >= MIN_HOURS && durationH <= MAX_HOURS;

  async function handleSubmit() {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      setError('Enter valid start and end times.');
      return;
    }
    if (endMs <= startMs) {
      setError(
        mode === 'start'
          ? 'The target end must be after the start.'
          : 'The end must be after the start.'
      );
      return;
    }
    if (!durationOk) {
      setError(`A fast must be between ${MIN_HOURS} and ${MAX_HOURS} hours long.`);
      return;
    }
    setBusy(true);
    setError(null);
    const startISO = new Date(startMs).toISOString();
    const endISO = new Date(endMs).toISOString();
    try {
      if (mode === 'start') {
        // Live fast: send the derived window as the goal; no end_at yet.
        await apiStartFast({ start_at: startISO, goal_hours: durationH });
      } else {
        // Logged fast: send both times; the server derives the goal.
        await apiStartFast({ start_at: startISO, end_at: endISO });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the fast.');
      setBusy(false);
    }
  }

  return (
    <Card padding="p-4">
      <div className="flex flex-col gap-5">
        <SegmentedControl<Mode>
          aria-label="Fast mode"
          options={[
            { value: 'start', label: 'Start a fast' },
            { value: 'log', label: 'Log a past fast' },
          ]}
          value={mode}
          onChange={setMode}
        />

        <Field
          label="Start"
          id="fast-start"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />

        <Field
          label={mode === 'start' ? 'Target end' : 'End'}
          id="fast-end"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />

        <p className="text-center text-sm text-text-muted">
          {durationOk ? (
            <>
              {mode === 'start' ? 'Planned window' : 'Duration'}:{' '}
              <span className="font-semibold text-text-primary">
                {formatDuration(durationH)}
              </span>
            </>
          ) : (
            <span className="text-text-muted">
              Pick a window of {MIN_HOURS}–{MAX_HOURS} hours.
            </span>
          )}
        </p>

        {error && <p className="text-sm text-fail">{error}</p>}

        <Button
          size="lg"
          fullWidth
          onClick={handleSubmit}
          disabled={busy || !durationOk}
          loading={busy}
        >
          {mode === 'start' ? 'Start fast' : 'Save fast'}
        </Button>
      </div>
    </Card>
  );
}
