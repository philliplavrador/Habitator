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
import type { Habit } from '@/lib/types';

interface Props {
  /** When provided, the form edits this habit; otherwise it creates a new one. */
  habit?: Habit;
}

const labelClass = 'block text-sm font-medium text-text-secondary mb-1.5';
const fieldClass =
  'w-full rounded-btn border border-border bg-surface px-3 py-2.5 text-text-primary placeholder:text-text-muted outline-none focus:border-accent';

export default function AddHabitForm({ habit }: Props) {
  const router = useRouter();
  const editing = Boolean(habit);

  const [name, setName] = useState(habit?.name ?? '');
  const [details, setDetails] = useState(habit?.details ?? '');
  const [exceptions, setExceptions] = useState(habit?.exceptions ?? '');
  // Default the new-habit start date to today, but compute it on the client only
  // (after mount) so SSR doesn't bake in the server's timezone day and cause a
  // hydration mismatch. An empty submit is still safe — the API defaults it.
  const [startDate, setStartDate] = useState(habit?.start_date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!habit) setStartDate((cur) => (cur === '' ? todayISO() : cur));
  }, [habit]);

  function goBack() {
    router.push('/');
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const input = {
      name: name.trim(),
      details: details.trim(),
      exceptions: exceptions.trim(),
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
    if (
      !window.confirm(
        `Delete "${habit.name}" and all its history? This cannot be undone.`
      )
    ) {
      return;
    }
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input
          id="name"
          className={fieldClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning run"
          autoFocus={!editing}
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="details" className={labelClass}>
          Details
        </label>
        <textarea
          id="details"
          className={`${fieldClass} min-h-[80px] resize-y`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What do you have to do?"
        />
      </div>

      <div>
        <label htmlFor="exceptions" className={labelClass}>
          Exceptions
        </label>
        <textarea
          id="exceptions"
          className={`${fieldClass} min-h-[60px] resize-y`}
          value={exceptions}
          onChange={(e) => setExceptions(e.target.value)}
          placeholder="e.g. if late, if sick — or None"
        />
      </div>

      <div>
        <label htmlFor="start_date" className={labelClass}>
          Start date
        </label>
        <input
          id="start_date"
          type="date"
          className={fieldClass}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">
          Stats only count days on or after this date.
        </p>
      </div>

      {error && <p className="text-sm text-fail">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-btn bg-accent px-4 py-3 text-center font-semibold text-white active:bg-accent-soft disabled:opacity-50"
      >
        {busy ? 'Saving…' : editing ? 'Save changes' : 'Add habit'}
      </button>

      <button
        type="button"
        onClick={goBack}
        disabled={busy}
        className="rounded-btn border border-border px-4 py-2.5 text-center text-text-secondary active:bg-surface2 disabled:opacity-50"
      >
        Cancel
      </button>

      {habit && (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={handleArchive}
            disabled={busy}
            className="rounded-btn border border-border px-4 py-2.5 text-center text-text-secondary active:bg-surface2 disabled:opacity-50"
          >
            {habit.archived === 0 ? 'Archive' : 'Unarchive'}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-btn border border-fail/40 px-4 py-2.5 text-center text-fail active:bg-fail/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
    </form>
  );
}
