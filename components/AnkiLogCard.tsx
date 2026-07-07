'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HeroLogCard from './HeroLogCard';
import { apiLogAnki } from '@/lib/client';
import { formatHumanYear } from '@/lib/dates';
import type { AnkiState } from '@/lib/types';
import { useCelebration } from './hooks/useCelebration';
import { useToast } from './ui/toast';

interface Props {
  initialState: AnkiState;
}

/**
 * The deck's hero card: cards-progress bar + today's new-card input. Logging
 * upserts today's row; after saving it triggers a router.refresh() so the rest
 * of the screen (pace, ETAs, streak, chart) recomputes from the server.
 */
export default function AnkiLogCard({ initialState }: Props) {
  const router = useRouter();
  const { burst } = useCelebration();
  const { show } = useToast();
  const [state, setState] = useState(initialState);
  const [value, setValue] = useState<string>(
    initialState.todayCount ? String(initialState.todayCount) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the server sends fresh data (router.refresh).
  useEffect(() => setState(initialState), [initialState]);
  useEffect(() => {
    setValue(initialState.todayCount ? String(initialState.todayCount) : '');
  }, [initialState.todayCount]);

  const parsedValue = (() => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  })();
  const belowMin =
    parsedValue !== null && parsedValue > 0 && parsedValue < state.dailyMin;

  async function save() {
    const cards = parsedValue ?? 0;
    setBusy(true);
    setError(null);
    try {
      const next = await apiLogAnki(state.today, cards);
      const justFinished = !state.goalReached && next.goalReached;
      setState(next);
      if (justFinished) {
        burst();
        show({
          tone: 'success',
          title: 'Goal complete! 🎉',
          description: `All ${next.goal.toLocaleString()} cards done.`,
        });
      } else {
        show({
          tone: 'success',
          title: state.loggedToday ? 'Updated today' : 'Logged today',
          description: `${cards} new card${cards === 1 ? '' : 's'}.`,
        });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const subtext = (
    <p className="mt-2 text-xs text-text-muted">
      <span className="font-semibold text-text-secondary tabular-nums">
        {state.totalDone.toLocaleString()} / {state.goal.toLocaleString()} cards
      </span>{' '}
      · {state.remaining.toLocaleString()} to go
      <span className="text-text-faint">
        {' '}
        · {state.deckTotal.toLocaleString()} in deck
      </span>
    </p>
  );

  return (
    <HeroLogCard
      display
      title={state.deckName}
      badge={
        state.goalReached ? 'Complete 🎉' : `${Math.floor(state.cardsPct * 100)}%`
      }
      pct={state.cardsPct}
      tone={state.goalReached ? 'pass' : 'accent'}
      subtext={subtext}
      input={
        state.goalReached
          ? undefined
          : {
              id: 'anki-today',
              value,
              onChange: (v) => {
                setValue(v);
                setError(null);
              },
              onSubmit: save,
              submitLabel: state.loggedToday ? 'Update today' : 'Log today',
              busy,
              disabled: parsedValue === null,
              min: 0,
              placeholder: String(state.dailyMin),
              label: (
                <>
                  New cards today{' '}
                  {state.loggedToday && (
                    <span className="text-text-faint">· editing today’s log</span>
                  )}
                </>
              ),
              note: belowMin ? (
                <p className="mt-1 text-center text-[11px] text-warn">
                  Below your {state.dailyMin}/day minimum.
                </p>
              ) : null,
              error,
            }
      }
    >
      {state.goalReached && (
        <p className="mt-3 rounded-btn bg-pass/10 px-3 py-2 text-center text-sm text-text-secondary">
          Goal reached
          {state.goalReachedDate ? ` on ${formatHumanYear(state.goalReachedDate)}` : ''}. 🎉
        </p>
      )}
    </HeroLogCard>
  );
}
