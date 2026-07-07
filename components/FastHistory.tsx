'use client';

import { useState } from 'react';
import StatTile from '@/components/ui/StatTile';
import { Field } from '@/components/ui/Field';
import EditableHistoryRow from '@/components/EditableHistoryRow';
import { apiDeleteFast, apiUpdateFast } from '@/lib/client';
import {
  formatDateTime,
  formatDuration,
  hoursBetween,
  toLocalInputValue,
} from '@/lib/dates';
import type { Fast, FastStats } from '@/lib/types';

interface Props {
  fasts: Fast[];
  stats: FastStats;
  /** Owner's timezone (resolved on the server) for all wall-clock display. */
  tz: string;
}

export default function FastHistory({ fasts, stats, tz }: Props) {
  // Only completed fasts appear in history; the active one lives in FastClient.
  const completed = fasts.filter((f) => f.end_at !== null);

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-base font-bold text-text-primary">History</h2>

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatTile label="Fasts" value={String(stats.totalFasts)} />
        <StatTile
          label="Avg length"
          value={stats.avgHours === null ? '—' : formatDuration(stats.avgHours)}
        />
        <StatTile
          label="Longest"
          value={
            stats.longestHours === null ? '—' : formatDuration(stats.longestHours)
          }
        />
        <StatTile label="Total time" value={formatDuration(stats.totalHours)} />
        <StatTile
          label="Goals hit"
          value={`${stats.goalsHit}/${stats.totalFasts}`}
          accent="pass"
        />
      </div>

      {completed.length === 0 ? (
        <p className="text-sm text-text-muted">No completed fasts yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {completed.map((fast) => (
            <FastRow key={fast.id} fast={fast} tz={tz} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FastRow({ fast, tz }: { fast: Fast; tz: string }) {
  const [start, setStart] = useState(() => toLocalInputValue(fast.start_at, tz));
  const [end, setEnd] = useState(() => toLocalInputValue(fast.end_at as string, tz));
  const [goal, setGoal] = useState(String(fast.goal_hours));

  const hours = hoursBetween(fast.start_at, fast.end_at as string);
  const hit = hours >= fast.goal_hours;

  async function handleSave() {
    const goalNum = Number(goal);
    if (!Number.isFinite(goalNum) || goalNum <= 0) {
      throw new Error('Enter a valid goal.');
    }
    // Validate the raw datetime-local strings BEFORE constructing Dates — an
    // empty/invalid field makes new Date(..).toISOString() throw a RangeError.
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new Error('Enter valid start and end times.');
    }
    if (endMs < startMs) {
      throw new Error('End cannot be before start.');
    }
    const startISO = new Date(startMs).toISOString();
    const endISO = new Date(endMs).toISOString();
    await apiUpdateFast(fast.id, {
      start_at: startISO,
      end_at: endISO,
      goal_hours: goalNum,
    });
  }

  return (
    <EditableHistoryRow
      flatRead
      confirmCopy={{
        title: 'Delete this fast?',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete',
      }}
      onSave={handleSave}
      onDelete={() => apiDeleteFast(fast.id)}
      read={
        <>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-text-primary">
              {formatDuration(hours)}
            </span>
            {hit && (
              <span className="rounded-btn bg-pass/15 px-1.5 py-0.5 text-xs font-semibold text-pass">
                ✓ goal
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            {formatDateTime(fast.start_at, tz)} → {formatDateTime(fast.end_at as string, tz)}
          </p>
          <p className="text-xs text-text-muted">
            Goal {formatDuration(fast.goal_hours)}
          </p>
        </>
      }
      editForm={
        <div className="flex flex-col gap-3">
          <Field
            label="Start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Field
            label="End"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <Field
            label="Goal (hours)"
            type="number"
            min={1}
            max={168}
            step="0.5"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
        </div>
      }
    />
  );
}
