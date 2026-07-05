'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SegmentedControl from './ui/SegmentedControl';
import Sheet from './ui/Sheet';
import { useToast } from './ui/toast';
import { apiClearEntry, apiSetEntry } from '@/lib/client';
import { addDays, compareISO, formatHuman, relativeLabel, weekdayOf } from '@/lib/dates';
import type { EntryStatus } from '@/lib/types';

interface Props {
  habitId: number;
  /** date (YYYY-MM-DD) → status, for this habit. */
  initialStatus: Record<string, EntryStatus>;
  startDate: string;
  today: string;
}

type Choice = EntryStatus | 'clear';

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[m - 1]} ${y}`;
}

/** Cells for a month grid: leading nulls for the first weekday, then each day. */
function monthCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = weekdayOf(`${month}-01`);
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${pad2(d)}`);
  return cells;
}

/**
 * Editable month calendar. Tap any day in range to set pass/fail or clear it —
 * writing through the same /api/entries endpoints the Today screen uses.
 * Future days and days before the start date are disabled to match the API.
 */
export default function HabitCalendar({ habitId, initialStatus, startDate, today }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [statuses, setStatuses] = useState<Map<string, EntryStatus>>(
    () => new Map(Object.entries(initialStatus))
  );
  const [month, setMonth] = useState(() => today.slice(0, 7));
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

  const startMonth = startDate.slice(0, 7);
  const todayMonth = today.slice(0, 7);
  const canPrev = month > startMonth;
  const canNext = month < todayMonth;

  async function handleSet(date: string, choice: Choice) {
    const prev = statuses.get(date) ?? null;
    pending.current.add(date);
    setStatuses((cur) => {
      const next = new Map(cur);
      if (choice === 'clear') next.delete(date);
      else next.set(date, choice);
      return next;
    });
    setSelected(null);
    try {
      if (choice === 'clear') await apiClearEntry(habitId, date);
      else await apiSetEntry(habitId, date, choice);
      router.refresh();
    } catch (e) {
      setStatuses((cur) => {
        const next = new Map(cur);
        if (prev) next.set(date, prev);
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
    ? (statuses.get(selected) ?? 'clear')
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
          const isFuture = compareISO(date, today) > 0;
          const isBefore = compareISO(date, startDate) < 0;
          const disabled = isFuture || isBefore;
          const isToday = date === today;
          const day = Number(date.slice(8, 10));

          let tone: string;
          if (status === 'pass') tone = 'bg-pass text-black font-semibold';
          else if (status === 'fail') tone = 'bg-fail text-white font-semibold';
          else if (disabled) tone = 'bg-transparent text-text-faint/50';
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
          options={[
            { value: 'pass', label: '✓ Pass' },
            { value: 'fail', label: '✗ Fail' },
            { value: 'clear', label: 'Clear' },
          ]}
          value={selectedStatus}
          onChange={(v) => selected && handleSet(selected, v)}
        />
      </Sheet>
    </div>
  );
}
