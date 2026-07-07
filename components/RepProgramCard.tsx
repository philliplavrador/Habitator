'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HeroLogCard, { heroInputClass } from './HeroLogCard';
import Button from './ui/Button';
import { apiLogReps, apiUploadRepVideo } from '@/lib/client';
import type { RepProgramState } from '@/lib/types';
import { useCelebration } from './hooks/useCelebration';
import { useToast } from './ui/toast';

interface Props {
  initialState: RepProgramState;
}

function restLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Interactive card for a rep program (pushups or pullups). Driven entirely by
 * `state.key`/`state.label`, so both programs share one component. Handles
 * logging an attempt (with an optional video), the between-sets rest timer, and
 * the attempt-streak readout.
 */
export default function RepProgramCard({ initialState }: Props) {
  const router = useRouter();
  const { burst } = useCelebration();
  const { show } = useToast();
  const [state, setState] = useState<RepProgramState>(initialState);
  const [reps, setReps] = useState<string[]>(initialState.target.map(String));
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Rest timer (counts down; null = idle).
  const [rest, setRest] = useState<number | null>(null);

  useEffect(() => setState(initialState), [initialState]);

  const targetKey = state.target.join(',');
  useEffect(() => {
    setReps(state.target.map(String));
  }, [targetKey]);

  useEffect(() => {
    if (rest === null || rest <= 0) return;
    const id = setTimeout(() => setRest((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(id);
  }, [rest]);

  const pct = state.completedCount / state.programDays;

  function clearVideo() {
    setVideo(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleComplete() {
    const parsed = reps.map((r) => {
      const n = parseInt(r, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      let next = await apiLogReps(state.key, parsed);

      // Optionally attach a video to the session we just created.
      if (video && next.lastAttempt) {
        try {
          next = await apiUploadRepVideo(state.key, next.lastAttempt.id, video);
          clearVideo();
        } catch (e) {
          show({
            tone: 'error',
            title: 'Session saved, but the video didn’t upload',
            description:
              e instanceof Error
                ? e.message
                : 'You can add it from the history below.',
          });
        }
      }

      setState(next);
      setLogging(false);
      setRest(null);
      const a = next.lastAttempt;
      if (a && !a.completed) {
        setFlash(
          `Logged ${a.reps.join(' · ')} — target was ${a.target.join(
            ' · '
          )}. Day ${a.day_index} stays until you hit every set (your streak is safe).`
        );
      } else if (next.completedCount > state.completedCount) {
        burst();
        show({
          tone: 'success',
          title: next.programComplete
            ? 'Program complete! 💪'
            : `Day ${a?.day_index ?? state.currentDay} done!`,
          description: next.programComplete
            ? `All ${next.programDays} days finished.`
            : `On to day ${next.currentDay}.`,
        });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your session.');
    } finally {
      setBusy(false);
    }
  }

  // ── Program complete ──
  if (state.programComplete) {
    return (
      <HeroLogCard title={state.label} badge="Complete 🎉" pct={1} tone="pass">
        <p className="mt-2 text-sm text-text-secondary">
          All {state.programDays} days done — you finished on {state.finishLabel}. 💪
        </p>
        <StreakLine state={state} />
      </HeroLogCard>
    );
  }

  const rested = state.doneToday !== null && !logging;

  const subtext = (
    <p className="mt-2 text-xs text-text-muted">
      <span className="font-semibold text-text-secondary">
        {state.daysLeft} {state.daysLeft === 1 ? 'day' : 'days'} left
      </span>{' '}
      · {Math.round(pct * 100)}% complete
    </p>
  );

  return (
    <HeroLogCard
      title={state.label}
      badge={`Day ${state.currentDay} of ${state.programDays}`}
      pct={pct}
      subtext={subtext}
    >
      <StreakLine state={state} />

      <div className="mt-3 rounded-btn bg-surface2/60 px-3 py-2 text-center text-sm">
        <span className="font-semibold text-text-primary">
          {state.target.join(' · ')}
        </span>{' '}
        <span className="text-text-muted">· {restLabel(state.restSeconds)} rest</span>
      </div>

      {rested ? (
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-pass">
            ✓ Day {state.doneToday!.day_index} done today
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Come back tomorrow for Day {state.currentDay}.
          </p>
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="mt-2 text-xs text-text-secondary underline active:text-text-primary"
          >
            Log another session
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {state.target.map((target, i) => (
              <label key={i} className="flex flex-col gap-1">
                <span className="text-center text-xs text-text-muted">
                  Set {i + 1} · goal {target}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={heroInputClass}
                  value={reps[i] ?? ''}
                  onChange={(e) => {
                    const next = [...reps];
                    next[i] = e.target.value;
                    setReps(next);
                    setFlash(null);
                  }}
                />
              </label>
            ))}
          </div>

          {/* Rest timer between sets */}
          <div className="flex items-center justify-center gap-3">
            {rest === null ? (
              <button
                type="button"
                onClick={() => setRest(state.restSeconds)}
                className="rounded-btn border border-border px-3 py-2 text-sm text-text-secondary active:bg-surface2"
              >
                ⏱ Rest {restLabel(state.restSeconds)}
              </button>
            ) : (
              <>
                <span
                  className={`font-mono text-lg font-bold tabular-nums ${
                    rest === 0 ? 'text-pass' : 'text-text-primary'
                  }`}
                >
                  {rest === 0 ? 'Rest done!' : `⏱ ${restLabel(rest)}`}
                </span>
                <button
                  type="button"
                  onClick={() => setRest(null)}
                  className="rounded-btn border border-border px-2.5 py-1.5 text-xs text-text-secondary active:bg-surface2"
                >
                  {rest === 0 ? 'Reset' : 'Skip'}
                </button>
              </>
            )}
          </div>

          {/* Optional video of the attempt */}
          <div className="flex flex-col gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
            />
            {video ? (
              <div className="flex items-center justify-between gap-2 rounded-btn border border-border bg-surface2/60 px-3 py-2 text-xs">
                <span className="min-w-0 truncate text-text-secondary">
                  🎬 {video.name}
                </span>
                <button
                  type="button"
                  onClick={clearVideo}
                  className="shrink-0 text-text-muted underline active:text-text-primary"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-btn border border-dashed border-border px-3 py-2 text-center text-xs text-text-muted active:bg-surface2"
              >
                🎬 Add a video (optional)
              </button>
            )}
          </div>

          {flash && (
            <p className="rounded-btn bg-fail/10 px-3 py-2 text-center text-xs text-text-secondary">
              {flash}
            </p>
          )}
          {error && <p className="text-center text-sm text-fail">{error}</p>}

          <Button fullWidth size="lg" onClick={handleComplete} disabled={busy}>
            {busy ? 'Saving…' : 'Complete session'}
          </Button>
        </div>
      )}
    </HeroLogCard>
  );
}

// ── Small presentational helpers ────────────────────────────────────

function StreakLine({ state }: { state: RepProgramState }) {
  if (state.currentStreak <= 0) return null;
  return (
    <p className="mt-2 text-xs text-text-muted">
      🔥{' '}
      <span className="font-semibold text-text-secondary">
        {state.currentStreak}-day
      </span>{' '}
      attempt streak
      {state.longestStreak > state.currentStreak
        ? ` · best ${state.longestStreak}`
        : ''}
    </p>
  );
}
