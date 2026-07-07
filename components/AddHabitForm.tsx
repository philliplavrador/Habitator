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
import type { Habit, HabitKind } from '@/lib/types';
import Button from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useConfirm } from '@/components/ui/confirm';

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
      kind,
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
            { value: 'build', label: 'Do daily' },
            { value: 'quit', label: 'Quit' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <p className="mt-1.5 text-xs text-text-muted">
          {isQuit
            ? 'Something to avoid (e.g. no social media before noon). Every day counts as clean — you only tap the days you slip.'
            : 'Something to get done every day (e.g. take meds). Check it off each day to keep your streak.'}
        </p>
      </div>

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
