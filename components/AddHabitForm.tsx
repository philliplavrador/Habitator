'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  apiArchiveHabit,
  apiCreateHabit,
  apiDeleteHabit,
  apiUpdateHabit,
} from '@/lib/client';
import { todayISO } from '@/lib/dates';
import { WEEKDAY_LABELS } from '@/lib/schedule';
import type { Habit, HabitKind, Schedule, ScheduleKind } from '@/lib/types';
import Button from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useConfirm } from '@/components/ui/confirm';

// Single letters for the weekday chips, indexed 0=Sun … 6=Sat.
const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

interface Props {
  /** When provided, the form edits this habit; otherwise it creates a new one. */
  habit?: Habit;
  /** Owner's timezone (resolved on the server) for the "today" default. */
  tz: string;
}

export default function AddHabitForm({ habit, tz }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const editing = Boolean(habit);

  const [name, setName] = useState(habit?.name ?? '');
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? 'build');

  // Schedule sub-state. Kept as separate fields so switching kinds preserves
  // what you last entered; assembled into a Schedule at submit (build only —
  // quit habits are "avoid every day", always daily).
  const initSchedule = habit?.schedule ?? { kind: 'daily' as const };
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(
    initSchedule.kind
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    initSchedule.kind === 'weekdays' ? initSchedule.days : [1, 3, 5]
  );
  const [interval, setIntervalDays] = useState<number>(
    initSchedule.kind === 'interval' ? initSchedule.every : 2
  );
  const [weeklyCount, setWeeklyCount] = useState<number>(
    initSchedule.kind === 'weekly' ? initSchedule.count : 3
  );

  const [details, setDetails] = useState(habit?.details ?? '');
  const [exceptions, setExceptions] = useState(habit?.exceptions ?? '');
  // Default the new-habit start date to today, but compute it on the client only
  // (after mount) so SSR doesn't bake in the server's timezone day and cause a
  // hydration mismatch. An empty submit is still safe — the API defaults it.
  const [startDate, setStartDate] = useState(habit?.start_date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!habit) setStartDate((cur) => (cur === '' ? todayISO(tz) : cur));
  }, [habit, tz]);

  function goBack() {
    router.push('/');
    router.refresh();
  }

  function toggleWeekday(d: number) {
    setWeekdays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    // Assemble the schedule (build habits only; quit is always daily).
    const schedule: Schedule =
      kind === 'quit'
        ? { kind: 'daily' }
        : scheduleKind === 'weekdays'
          ? { kind: 'weekdays', days: weekdays }
          : scheduleKind === 'interval'
            ? { kind: 'interval', every: interval }
            : scheduleKind === 'weekly'
              ? { kind: 'weekly', count: weeklyCount }
              : { kind: 'daily' };
    if (schedule.kind === 'weekdays' && schedule.days.length === 0) {
      setError('Pick at least one day of the week.');
      return;
    }
    setBusy(true);
    setError(null);
    const input = {
      name: name.trim(),
      details: details.trim(),
      exceptions: exceptions.trim(),
      kind,
      schedule,
      start_date: startDate,
    };
    try {
      if (habit) await apiUpdateHabit(habit.id, input);
      else await apiCreateHabit(input);
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!habit) return;
    setBusy(true);
    setError(null);
    try {
      await apiArchiveHabit(habit.id, habit.archived === 0);
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive.');
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!habit) return;
    const ok = await confirm({
      title: `Delete "${habit.name}"?`,
      message: 'This removes the habit and all its history. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiDeleteHabit(habit.id);
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.');
      setBusy(false);
    }
  }

  const isQuit = kind === 'quit';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <span className="mb-1.5 block text-sm font-medium text-text-secondary">
          Type
        </span>
        <SegmentedControl<HabitKind>
          aria-label="Habit type"
          options={[
            { value: 'build', label: 'Build' },
            { value: 'quit', label: 'Quit' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          {isQuit
            ? 'Something to avoid (e.g. no social media before noon). Every day counts as clean — you only tap the days you slip.'
            : 'Something to get done (e.g. take meds). Check it off to keep your streak.'}
        </p>
      </div>

      {/* Schedule — build habits only. Quit habits are "avoid every day", so
          they're always daily and the picker is hidden. */}
      {!isQuit && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-text-secondary">
            Schedule
          </span>
          <SegmentedControl<ScheduleKind>
            aria-label="Schedule"
            size="sm"
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekdays', label: 'Days' },
              { value: 'interval', label: 'Interval' },
              { value: 'weekly', label: 'Weekly' },
            ]}
            value={scheduleKind}
            onChange={setScheduleKind}
          />

          {scheduleKind === 'daily' && (
            <p className="mt-2 text-xs text-text-muted">
              Every day. A blank day stays an exception, not a miss.
            </p>
          )}

          {scheduleKind === 'weekdays' && (
            <div className="mt-3">
              <div className="flex gap-1.5">
                {WEEKDAY_INITIALS.map((letter, d) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAY_LABELS[d]}
                      onClick={() => toggleWeekday(d)}
                      className={[
                        'flex h-10 flex-1 items-center justify-center rounded-btn border text-sm font-semibold transition-colors',
                        on
                          ? 'border-accent bg-accent/15 text-accent-400'
                          : 'border-border bg-surface2 text-text-muted active:border-accent',
                      ].join(' ')}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Only shows on the chosen days. A chosen day you skip breaks the streak.
              </p>
            </div>
          )}

          {scheduleKind === 'interval' && (
            <div className="mt-3">
              <Field
                label="Every N days"
                type="number"
                min={2}
                max={365}
                value={interval}
                onChange={(e) =>
                  setIntervalDays(
                    Math.max(2, Math.min(365, Math.floor(Number(e.target.value) || 2)))
                  )
                }
                hint="Counted from the start date. Every other day = 2."
              />
            </div>
          )}

          {scheduleKind === 'weekly' && (
            <div className="mt-3">
              <Field
                label="Times per week"
                type="number"
                min={1}
                max={7}
                value={weeklyCount}
                onChange={(e) =>
                  setWeeklyCount(
                    Math.max(1, Math.min(7, Math.floor(Number(e.target.value) || 1)))
                  )
                }
                hint={`Do it any ${weeklyCount} ${
                  weeklyCount === 1 ? 'day' : 'days'
                } each week. A week under target breaks the streak.`}
              />
            </div>
          )}
        </div>
      )}

      <Field
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={isQuit ? 'e.g. No social media before noon' : 'e.g. Morning run'}
        autoFocus={!editing}
        maxLength={200}
      />

      <Textarea
        label="Details"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={isQuit ? 'What are you avoiding, and why?' : 'What do you have to do?'}
      />

      <Textarea
        label="Exceptions"
        className="min-h-[60px]"
        value={exceptions}
        onChange={(e) => setExceptions(e.target.value)}
        placeholder="e.g. if late, if sick — or None"
      />

      <Field
        label="Start date"
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        hint="Stats only count days on or after this date."
      />

      {error && <p className="text-sm text-fail">{error}</p>}

      <Button type="submit" size="lg" fullWidth loading={busy}>
        {editing ? 'Save changes' : 'Add habit'}
      </Button>

      <Button type="button" variant="secondary" fullWidth onClick={goBack} disabled={busy}>
        Cancel
      </Button>

      {habit && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={handleArchive}
            disabled={busy}
          >
            {habit.archived === 0 ? 'Archive' : 'Unarchive'}
          </Button>
          <Button
            type="button"
            variant="danger"
            fullWidth
            onClick={handleDelete}
            disabled={busy}
          >
            Delete
          </Button>
        </div>
      )}
    </form>
  );
}
