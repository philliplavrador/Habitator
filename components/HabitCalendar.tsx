'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SegmentedControl from './ui/SegmentedControl';
import Sheet from './ui/Sheet';
import RestDaySheet from './RestDaySheet';
import { useToast } from './ui/toast';
import {
  WEEKDAY_HEADERS,
  monthCells,
  monthLabel,
  shiftMonth,
} from './calendarGrid';
import {
  apiClearEntry,
  apiClearException,
  apiSetEntry,
  apiSetException,
} from '@/lib/client';
import { compareISO, formatHuman, relativeLabel } from '@/lib/dates';
import { isDueOn } from '@/lib/schedule';
import type { EntryStatus, HabitKind, Schedule } from '@/lib/types';

interface Props {
  habitId: number;
  /** date (YYYY-MM-DD) → status, for this habit. */
  initialStatus: Record<string, EntryStatus>;
  /** Dates (YYYY-MM-DD) marked as rest-day exceptions for this habit. */
  initialExceptions?: string[];
  /** Optional date (YYYY-MM-DD) → reason, to pre-fill when editing a rest day. */
  initialReasons?: Record<string, string>;
  startDate: string;
  /** Optional end date (YYYY-MM-DD); days after it are out of range (disabled). */
  endDate?: string | null;
  today: string;
  /** Habit kind — a `quit` habit edits slips only (see below). */
  kind?: HabitKind;
  /** Habit schedule — off-days (not due) are dimmed for weekday/interval habits. */
  schedule?: Schedule;
}

type Choice = EntryStatus | 'exception' | 'clear';

/**
 * Editable month calendar. Tap any day in range to set pass/fail, mark it as a
 * rest-day exception, or clear it — writing through the same /api/entries and
 * /api/exceptions endpoints the rest of the app uses. An exception excuses a
 * missed day so it doesn't break the streak (it's stored separately from the
 * pass/fail entry, and the two are kept mutually exclusive here). Future days and
 * days before the start date are disabled to match the API.
 */
export default function HabitCalendar({
  habitId,
  initialStatus,
  initialExceptions = [],
  initialReasons = {},
  startDate,
  endDate = null,
  today,
  kind = 'build',
  schedule = { kind: 'daily' },
}: Props) {
  const isQuit = kind === 'quit';
  const ref = String(habitId);
  const router = useRouter();
  const { show } = useToast();
  // The date whose rest-day reason prompt is open (null = closed).
  const [reasonDate, setReasonDate] = useState<string | null>(null);
  const [savingReason, setSavingReason] = useState(false);
  const [statuses, setStatuses] = useState<Map<string, EntryStatus>>(
    () => new Map(Object.entries(initialStatus))
  );
  const [exceptions, setExceptions] = useState<Set<string>>(
    () => new Set(initialExceptions)
  );
  // Open on the habit's last active month when it has already ended, so an ended
  // habit doesn't land on an empty, fully-disabled current month. Otherwise today.
  const [month, setMonth] = useState(() =>
    endDate !== null && compareISO(endDate, today) < 0
      ? endDate.slice(0, 7)
      : today.slice(0, 7)
  );
  const [selected, setSelected] = useState<string | null>(null);
  const pending = useRef<Set<string>>(new Set());

  // Re-sync from the server after a write, preserving any still-in-flight day.
  useEffect(() => {
    const fresh = new Map(Object.entries(initialStatus));
    for (const d of pending.current) {
      const local = statuses.get(d);
      if (local) fresh.set(d, local);
      else fresh.delete(d);
    }
    setStatuses(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatus]);

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

  async function handleSet(date: string, choice: Choice, reason?: string) {
    const prevStatus = statuses.get(date) ?? null;
    const prevExc = exceptions.has(date);
    pending.current.add(date);
    // Optimistic local update — exception is mutually exclusive with pass/fail.
    setStatuses((cur) => {
      const next = new Map(cur);
      if (choice === 'pass' || choice === 'fail') next.set(date, choice);
      else next.delete(date);
      return next;
    });
    setExceptions((cur) => {
      const next = new Set(cur);
      if (choice === 'exception') next.add(date);
      else next.delete(date);
      return next;
    });
    setSelected(null);
    try {
      if (choice === 'exception') {
        if (prevStatus) await apiClearEntry(habitId, date);
        await apiSetException('habit', ref, date, reason);
      } else if (choice === 'clear') {
        if (prevStatus) await apiClearEntry(habitId, date);
        if (prevExc) await apiClearException('habit', ref, date);
      } else {
        if (prevExc) await apiClearException('habit', ref, date);
        await apiSetEntry(habitId, date, choice);
      }
      router.refresh();
    } catch (e) {
      // Roll both back to their pre-tap values.
      setStatuses((cur) => {
        const next = new Map(cur);
        if (prevStatus) next.set(date, prevStatus);
        else next.delete(date);
        return next;
      });
      setExceptions((cur) => {
        const next = new Set(cur);
        if (prevExc) next.add(date);
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
  const selectedStatus: Choice = selected
    ? exceptions.has(selected)
      ? 'exception'
      : (statuses.get(selected) ?? 'clear')
    : 'clear';

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
          const status = statuses.get(date);
          const isExc = exceptions.has(date);
          const isFuture = compareISO(date, today) > 0;
          const isBefore = compareISO(date, startDate) < 0;
          const isAfterEnd = endDate !== null && compareISO(date, endDate) > 0;
          const disabled = isFuture || isBefore || isAfterEnd;
          const isToday = date === today;
          // Off-day: in-range but not scheduled (weekday/interval habits). Still
          // tappable (you may log an extra day), just visually de-emphasized.
          const isOff = !disabled && !isQuit && !isDueOn(schedule, startDate, date);
          const day = Number(date.slice(8, 10));

          let tone: string;
          if (isExc)
            // A rest day — neon pink, matching the heatmap's excused colour.
            tone =
              'bg-exception/20 text-exception ring-1 ring-inset ring-exception/50 active:bg-exception/30';
          else if (status === 'fail') tone = 'bg-fail text-white font-semibold';
          else if (status === 'pass') tone = 'bg-pass text-black font-semibold';
          else if (disabled) tone = 'bg-transparent text-text-faint/50';
          // For a quit habit, an in-range blank day is a clean win, so tint it
          // green (subtly) instead of the neutral "no data" grey.
          else if (isQuit) tone = 'bg-pass/15 text-pass active:bg-pass/25';
          else if (isOff) tone = 'bg-surface2/30 text-text-faint/60 active:bg-surface2/50';
          else tone = 'bg-surface2 text-text-secondary active:bg-surface3';

          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(date)}
              className={`flex aspect-square items-center justify-center rounded-btn text-xs transition-colors ${tone} ${
                isToday ? 'ring-1 ring-accent' : ''
              } ${disabled ? 'cursor-default' : ''}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? relativeLabel(selected, today) : ''}
      >
        <p className="mb-3 text-center text-xs text-text-muted">
          {selected ? formatHuman(selected) : ''}
        </p>
        <SegmentedControl<Choice>
          aria-label="Set status"
          options={
            isQuit
              ? [
                  { value: 'fail', label: '✗ Slipped' },
                  { value: 'clear', label: '✓ Clean' },
                  { value: 'exception', label: '◆ Rest' },
                ]
              : [
                  { value: 'pass', label: '✓ Pass' },
                  { value: 'fail', label: '✗ Fail' },
                  { value: 'exception', label: '◆ Rest' },
                  { value: 'clear', label: 'Clear' },
                ]
          }
          value={selectedStatus}
          onChange={(v) => {
            if (!selected) return;
            // Marking a rest day opens the reason prompt first; the other choices
            // commit immediately.
            if (v === 'exception') {
              setReasonDate(selected);
              setSelected(null);
            } else {
              handleSet(selected, v);
            }
          }}
        />
        <p className="mt-3 text-center text-xs text-text-muted">
          A rest day is excused — it won&apos;t count against your streak.
        </p>
      </Sheet>

      <RestDaySheet
        open={reasonDate !== null}
        dateLabel={reasonDate ? formatHuman(reasonDate) : ''}
        initialReason={reasonDate ? initialReasons[reasonDate] ?? '' : ''}
        saving={savingReason}
        onSave={async (reason) => {
          if (!reasonDate) return;
          setSavingReason(true);
          await handleSet(reasonDate, 'exception', reason);
          setSavingReason(false);
          setReasonDate(null);
        }}
        onClose={() => !savingReason && setReasonDate(null)}
      />
    </div>
  );
}
