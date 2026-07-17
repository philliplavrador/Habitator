'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './ui/toast';
import {
  WEEKDAY_HEADERS,
  monthCells,
  monthLabel,
  shiftMonth,
} from './calendarGrid';
import { apiClearException, apiSetException } from '@/lib/client';
import { compareISO } from '@/lib/dates';

interface Props {
  /** Tracker scope — 'rep' | 'plank' | 'anki'. */
  scope: string;
  /** Tracker ref — a rep/plank program key, or 'japanese'. */
  refId: string;
  /** Dates (YYYY-MM-DD) already marked as rest days. */
  initialExceptions: string[];
  /** Earliest tappable day (the tracker's start). */
  startDate: string;
  today: string;
}

/**
 * A compact month calendar for marking rest days on a custom habit (rep program,
 * plank, or Anki). Tapping a past in-range day toggles a streak exception through
 * /api/exceptions, so a skipped day doesn't break the tracker's streak. Mirrors
 * HabitCalendar's grid but with a single tap-to-toggle interaction (no pass/fail).
 */
export default function RestDayEditor({
  scope,
  refId,
  initialExceptions,
  startDate,
  today,
}: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [exceptions, setExceptions] = useState<Set<string>>(
    () => new Set(initialExceptions)
  );
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const pending = useRef<Set<string>>(new Set());

  // Re-sync from the server after a write, preserving any still-in-flight day.
  useEffect(() => {
    const fresh = new Set(initialExceptions);
    for (const d of pending.current) {
      if (exceptions.has(d)) fresh.add(d);
      else fresh.delete(d);
    }
    setExceptions(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExceptions]);

  const startMonth = startDate.slice(0, 7);
  const todayMonth = today.slice(0, 7);
  const canPrev = month > startMonth;
  const canNext = month < todayMonth;

  async function toggle(date: string) {
    const wasExc = exceptions.has(date);
    pending.current.add(date);
    setExceptions((cur) => {
      const next = new Set(cur);
      if (wasExc) next.delete(date);
      else next.add(date);
      return next;
    });
    try {
      if (wasExc) await apiClearException(scope, refId, date);
      else await apiSetException(scope, refId, date);
      router.refresh();
    } catch (e) {
      setExceptions((cur) => {
        const next = new Set(cur);
        if (wasExc) next.add(date);
        else next.delete(date);
        return next;
      });
      show({
        tone: 'error',
        title: 'Could not save',
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      pending.current.delete(date);
    }
  }

  const cells = monthCells(month);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canPrev}
          onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-btn border border-border text-text-secondary active:bg-surface2 disabled:opacity-30"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-text-primary">
          {monthLabel(month)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-btn border border-border text-text-secondary active:bg-surface2 disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_HEADERS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-text-faint">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (date === null) return <div key={`e${i}`} />;
          const isExc = exceptions.has(date);
          const isFuture = compareISO(date, today) > 0;
          const isBefore = compareISO(date, startDate) < 0;
          const disabled = isFuture || isBefore;
          const isToday = date === today;
          const day = Number(date.slice(8, 10));

          let tone: string;
          if (isExc)
            tone =
              'bg-accent/15 text-accent ring-1 ring-inset ring-accent/40 active:bg-accent/25';
          else if (disabled) tone = 'bg-transparent text-text-faint/50';
          else tone = 'bg-surface2 text-text-secondary active:bg-surface3';

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => toggle(date)}
              className={`flex aspect-square items-center justify-center rounded-btn text-xs transition-colors ${tone} ${
                isToday ? 'ring-1 ring-accent' : ''
              } ${disabled ? 'cursor-default' : ''}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-text-muted">
        Tap a day you couldn&apos;t train to mark it a rest day — excused days
        won&apos;t break your streak. Tap again to undo.
      </p>
    </div>
  );
}
