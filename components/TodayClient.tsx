'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HabitRow from './HabitRow';
import ProgressRing from './ProgressRing';
import CountUp from './ui/CountUp';
import { useCelebration } from './hooks/useCelebration';
import { useToast } from './ui/toast';
import { apiClearEntry, apiSetEntry } from '@/lib/client';
import type { EntryStatus, HabitDayView } from '@/lib/types';

interface Props {
  date: string;
  initialItems: HabitDayView[];
}

const MILESTONES = [7, 30, 100];

export default function TodayClient({ date, initialItems }: Props) {
  const router = useRouter();
  const { perfectDay, milestone } = useCelebration();
  const { show } = useToast();
  const [items, setItems] = useState<HabitDayView[]>(initialItems);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Habit ids with an in-flight write. A fresh server snapshot (from another
  // habit's router.refresh()) must not clobber a habit we just optimistically
  // changed but whose own write hasn't landed yet — otherwise rapid taps flicker.
  const pending = useRef<Set<number>>(new Set());

  // Re-sync when the server sends fresh data (date change or router.refresh),
  // but preserve the optimistic status of any habit with a write still in flight.
  useEffect(() => {
    setItems((prev) =>
      initialItems.map((srv) =>
        pending.current.has(srv.habit.id)
          ? prev.find((p) => p.habit.id === srv.habit.id) ?? srv
          : srv
      )
    );
  }, [initialItems]);

  const doneCount = items.filter((i) => i.status === 'pass').length;
  const total = items.length;
  const progress = total > 0 ? doneCount / total : 0;
  const allDone = total > 0 && doneCount === total;

  // ── Perfect-day celebration ──
  // Fire when the day flips from not-all-done to all-done. Initialize the ref to
  // the current state so an already-complete day doesn't celebrate on load.
  const prevAllDone = useRef(allDone);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      perfectDay();
      show({
        tone: 'success',
        title: 'Perfect day!',
        description: `All ${total} habits done.`,
      });
    }
    prevAllDone.current = allDone;
  }, [allDone, total, perfectDay, show]);

  // ── Streak-milestone celebration ──
  // Streaks are server-computed, so watch the fresh server snapshot for a habit
  // crossing 7/30/100. Skip the first sync so existing streaks don't fire on load.
  const seenStreaks = useRef<Map<number, number>>(new Map());
  const streaksInit = useRef(false);
  useEffect(() => {
    for (const it of initialItems) {
      const prev = seenStreaks.current.get(it.habit.id) ?? 0;
      const cur = it.currentStreak;
      if (streaksInit.current && cur > prev) {
        const crossed = MILESTONES.filter((m) => cur >= m && prev < m);
        if (crossed.length) {
          const m = Math.max(...crossed);
          milestone(m);
          show({
            tone: 'success',
            title: `🔥 ${m}-day streak!`,
            description: it.habit.name,
          });
        }
      }
      seenStreaks.current.set(it.habit.id, cur);
    }
    streaksInit.current = true;
  }, [initialItems, milestone, show]);

  async function handleSet(habitId: number, next: EntryStatus | null) {
    const prevStatus =
      items.find((i) => i.habit.id === habitId)?.status ?? null;
    pending.current.add(habitId);
    // Optimistic update.
    setItems((cur) =>
      cur.map((i) => (i.habit.id === habitId ? { ...i, status: next } : i))
    );
    setBusyId(habitId);
    setError(null);
    try {
      if (next === null) await apiClearEntry(habitId, date);
      else await apiSetEntry(habitId, date, next);
      // Pull fresh streaks/counts from the server.
      router.refresh();
    } catch (e) {
      // Revert just this habit, leaving other in-flight changes intact.
      setItems((cur) =>
        cur.map((i) =>
          i.habit.id === habitId ? { ...i, status: prevStatus } : i
        )
      );
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      pending.current.delete(habitId);
      setBusyId(null);
    }
  }

  return (
    <div>
      {total > 0 && (
        <div className="mb-6 flex flex-col items-center">
          <ProgressRing progress={progress} reached={allDone} size={168} stroke={12}>
            <div className="font-display text-3xl font-bold tabular-nums text-text-primary">
              <CountUp value={Math.round(progress * 100)} suffix="%" />
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {doneCount} of {total} done
            </div>
          </ProgressRing>
          <p
            className={`mt-3 text-sm font-semibold ${
              allDone ? 'text-pass' : 'text-text-muted'
            }`}
          >
            {allDone ? 'Perfect day 🎉' : 'Keep your momentum going'}
          </p>
        </div>
      )}

      {total === 0 && (
        <p className="mb-3 text-sm text-text-muted">No habits for this day yet.</p>
      )}

      {error && (
        <p className="mb-3 rounded-btn bg-fail/15 px-3 py-2 text-sm text-fail">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((view) => (
            <HabitRow
              key={view.habit.id}
              view={view}
              busy={busyId === view.habit.id}
              onSetStatus={(next) => handleSet(view.habit.id, next)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
