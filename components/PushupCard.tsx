'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProgressBar from './ProgressBar';
import { apiLogPushups } from '@/lib/client';
import type { PushupState } from '@/lib/types';

interface Props {
  initialState: PushupState;
}

const inputClass =
  'w-full rounded-btn border border-border bg-surface2 px-3 py-2.5 text-center text-lg font-semibold text-text-primary outline-none focus:border-accent';

function restLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PushupCard({ initialState }: Props) {
  const router = useRouter();
  const [state, setState] = useState<PushupState>(initialState);
  const [reps, setReps] = useState<string[]>(initialState.target.map(String));
  const [logging, setLogging] = useState(false); // reveal input in the rested state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Rest timer (counts down; null = idle).
  const [rest, setRest] = useState<number | null>(null);

  // Re-sync when the server sends fresh data (router.refresh).
  useEffect(() => setState(initialState), [initialState]);

  // Whenever the prescription changes (a day was completed), reset the inputs
  // to the new target so hitting exactly the target is a one-tap log.
  const targetKey = state.target.join(',');
  useEffect(() => {
    setReps(state.target.map(String));
  }, [targetKey]);

  // Tick the rest timer down to 0, then hold.
  useEffect(() => {
    if (rest === null || rest <= 0) return;
    const id = setTimeout(() => setRest((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(id);
  }, [rest]);

  const pct = state.completedCount / state.programDays;

  async function handleComplete() {
    const parsed = reps.map((r) => {
      const n = parseInt(r, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const next = await apiLogPushups(parsed);
      setState(next);
      setLogging(false);
      setRest(null);
      const a = next.lastAttempt;
      if (a && !a.completed) {
        setFlash(
          `Logged ${a.reps.join(' · ')} — target was ${a.target.join(
            ' · '
          )}. Day ${a.day_index} stays until you hit every set.`
        );
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
      <Card>
        <Header title="Pushups" badge="Complete 🎉" />
        <ProgressBar value={1} tone="pass" />
        <p className="mt-2 text-sm text-text-secondary">
          All {state.programDays} days done — you finished on 3 × 50. 💪
        </p>
      </Card>
    );
  }

  const [t1, t2, t3] = state.target;
  const rested = state.doneToday !== null && !logging;

  return (
    <Card>
      <Header title="Pushups" badge={`Day ${state.currentDay} of ${state.programDays}`} />

      <ProgressBar value={pct} />
      <p className="mt-2 text-xs text-text-muted">
        <span className="font-semibold text-text-secondary">
          {state.daysLeft} {state.daysLeft === 1 ? 'day' : 'days'} left
        </span>{' '}
        · {Math.round(pct * 100)}% complete
      </p>

      <div className="mt-3 rounded-btn bg-surface2/60 px-3 py-2 text-center text-sm">
        <span className="font-semibold text-text-primary">
          {t1} · {t2} · {t3}
        </span>{' '}
        <span className="text-text-muted">· {state.restSeconds}s rest</span>
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
            {[t1, t2, t3].map((target, i) => (
              <label key={i} className="flex flex-col gap-1">
                <span className="text-center text-xs text-text-muted">
                  Set {i + 1} · goal {target}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className={inputClass}
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

          {/* 90s rest timer between sets */}
          <div className="flex items-center justify-center gap-3">
            {rest === null ? (
              <button
                type="button"
                onClick={() => setRest(state.restSeconds)}
                className="rounded-btn border border-border px-3 py-2 text-sm text-text-secondary active:bg-surface2"
              >
                ⏱ Rest {state.restSeconds}s
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

          {flash && (
            <p className="rounded-btn bg-fail/10 px-3 py-2 text-center text-xs text-text-secondary">
              {flash}
            </p>
          )}
          {error && <p className="text-center text-sm text-fail">{error}</p>}

          <button
            type="button"
            onClick={handleComplete}
            disabled={busy}
            className="rounded-btn bg-accent px-4 py-3 text-center font-semibold text-white active:bg-accent-soft disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Complete session'}
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Small presentational helpers ────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-card border border-border bg-surface p-4">
      {children}
    </section>
  );
}

function Header({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-base font-bold text-text-primary">{title}</h2>
      <span className="text-xs font-semibold text-accent">{badge}</span>
    </div>
  );
}
