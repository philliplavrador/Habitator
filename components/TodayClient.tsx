'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HabitRow from './HabitRow';
import { apiClearEntry, apiSetEntry } from '@/lib/client';
import type { EntryStatus, HabitDayView } from '@/lib/types';

interface Props {
  date: string;
  initialItems: HabitDayView[];
}

export default function TodayClient({ date, initialItems }: Props) {
  const router = useRouter();
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
      <p className="mb-3 text-sm text-text-muted">
        {total === 0 ? (
          'No habits for this day yet.'
        ) : (
          <>
            <span className="font-semibold text-text-primary">
              {doneCount} / {total}
            </span>{' '}
            done
          </>
        )}
      </p>

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
