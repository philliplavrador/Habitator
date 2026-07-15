'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import HeroLogCard, { heroInputClass } from './HeroLogCard';
import Button from './ui/Button';
import SegmentedControl from './ui/SegmentedControl';
import { apiLogPlank, apiUploadPlankVideo } from '@/lib/client';
import { formatHold } from '@/lib/plankFormat';
import type { PlankProgramState } from '@/lib/types';
import { useCelebration } from './hooks/useCelebration';
import { useToast } from './ui/toast';

// Lazy-load the camera flow so its media-capture code stays out of the plank
// page's First Load JS. Only rendered when mode === 'record', so ssr:false is safe.
const PlankTimer = dynamic(() => import('./PlankTimer'), {
  ssr: false,
  loading: () => null,
});

interface Props {
  initialState: PlankProgramState;
}

type LogMode = 'manual' | 'record';

/**
 * Interactive card for a plank program. Two ways to log the day's hold: "Type
 * time" (enter the seconds you held, with an optional video) or "Record" (the
 * guided countdown-timer camera flow in PlankTimer). Mirrors RepProgramCard, but
 * for a single timed hold rather than reps across sets.
 */
export default function PlankProgramCard({ initialState }: Props) {
  const router = useRouter();
  const { burst } = useCelebration();
  const { show } = useToast();
  const [state, setState] = useState<PlankProgramState>(initialState);
  const [held, setHeld] = useState<string>(String(initialState.targetSeconds));
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [mode, setMode] = useState<LogMode>('manual');

  // Manual mode: an optional video, attached after the session is logged.
  const [video, setVideo] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setState(initialState), [initialState]);

  useEffect(() => {
    setHeld(String(state.targetSeconds));
    setVideo(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [state.targetSeconds]);

  const pct = state.completedCount / state.programDays;

  function onVideoPicked(file: File | null) {
    if (fileRef.current) fileRef.current.value = '';
    if (file) setVideo(file);
  }

  // Shared post-log handling: refresh the card, flash a "fell short" note or fire
  // the day-done celebration. `prevCompleted` is the count before this log.
  function announceResult(next: PlankProgramState, prevCompleted: number) {
    setState(next);
    setLogging(false);
    const a = next.lastAttempt;
    if (a && !a.completed) {
      setFlash(
        `Logged ${formatHold(a.lasted_seconds)} — target was ${formatHold(
          a.target_seconds
        )}. Day ${a.day_index} stays until you hold the full time (your streak is safe).`
      );
    } else if (next.completedCount > prevCompleted) {
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
  }

  // ── Manual: log the typed hold, then attach the optional video. ──
  async function handleComplete() {
    const n = parseInt(held, 10);
    const lasted = Number.isFinite(n) && n >= 0 ? n : 0;
    const prev = state.completedCount;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      let next = await apiLogPlank(state.basePath, lasted);
      const sessionId = next.lastAttempt?.id;
      if (sessionId != null && video) {
        try {
          next = await apiUploadPlankVideo(state.basePath, sessionId, video);
        } catch (e) {
          show({
            tone: 'error',
            title: 'Video didn’t upload',
            description:
              e instanceof Error ? e.message : 'You can add it from the history below.',
          });
        }
        setVideo(null);
      }
      announceResult(next, prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your session.');
    } finally {
      setBusy(false);
    }
  }

  // ── Guided: log the measured hold, then attach the one video. ──
  async function handleGuidedSave(lasted: number, file: File) {
    const prev = state.completedCount;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      let next = await apiLogPlank(state.basePath, lasted);
      const sessionId = next.lastAttempt?.id;
      if (sessionId != null) {
        try {
          next = await apiUploadPlankVideo(state.basePath, sessionId, file);
        } catch (e) {
          show({
            tone: 'error',
            title: 'Session saved, but the video didn’t upload',
            description:
              e instanceof Error ? e.message : 'You can add it from the history below.',
          });
        }
      }
      setMode('manual');
      announceResult(next, prev);
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
          All {state.programDays} days done — you finished on a {state.finishLabel}{' '}
          hold. 💪
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
        <span className="text-text-muted">Hold for </span>
        <span className="font-semibold text-text-primary">
          {formatHold(state.targetSeconds)}
        </span>
      </div>

      {rested ? (
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-pass">
            ✓ Day {state.doneToday!.day_index} done today
          </p>
          <p className="mt-1 text-xs text-text-muted">
            You held {formatHold(state.doneToday!.lasted_seconds)}. Come back
            tomorrow for Day {state.currentDay}.
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
          <SegmentedControl<LogMode>
            aria-label="How to log this hold"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'manual', label: 'Type time' },
              { value: 'record', label: '📷 Record' },
            ]}
          />

          {mode === 'record' ? (
            <PlankTimer
              targetSeconds={state.targetSeconds}
              label={state.label}
              busy={busy}
              onSave={handleGuidedSave}
              onCancel={() => setMode('manual')}
            />
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-center text-xs text-text-muted">
                  Seconds held
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={heroInputClass}
                  value={held}
                  onChange={(e) => {
                    setHeld(e.target.value);
                    setFlash(null);
                  }}
                />
                <span className="text-center text-xs text-text-faint">
                  = {formatHold(parseInt(held, 10) || 0)}
                </span>
              </label>

              {/* Optional single video (attached after the session logs). */}
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => onVideoPicked(e.target.files?.[0] ?? null)}
              />
              {video ? (
                <div className="flex items-center justify-between gap-2 rounded-btn border border-border bg-surface2/60 px-3 py-2 text-xs">
                  <span className="min-w-0 truncate text-text-secondary">
                    🎬 {video.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setVideo(null)}
                    className="shrink-0 text-text-muted active:text-text-primary"
                    aria-label="Remove video"
                  >
                    ✕
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

              {flash && (
                <p className="rounded-btn bg-fail/10 px-3 py-2 text-center text-xs text-text-secondary">
                  {flash}
                </p>
              )}
              {error && <p className="text-center text-sm text-fail">{error}</p>}

              <Button fullWidth size="lg" onClick={handleComplete} disabled={busy}>
                {busy ? 'Saving…' : 'Complete session'}
              </Button>
            </>
          )}

          {mode === 'record' && error && (
            <p className="text-center text-sm text-fail">{error}</p>
          )}
        </div>
      )}
    </HeroLogCard>
  );
}

// ── Small presentational helpers ────────────────────────────────────

function StreakLine({ state }: { state: PlankProgramState }) {
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
