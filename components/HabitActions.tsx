'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiArchiveHabit, apiDeleteHabit } from '@/lib/client';

interface Props {
  id: number;
  name: string;
  archived: boolean;
}

/** Edit / Archive-Unarchive / Delete controls for the habit detail page. */
export default function HabitActions({ id, name, archived }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setBusy(true);
    setError(null);
    try {
      await apiArchiveHabit(id, !archived);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not archive.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(`Delete "${name}" and all its history? This cannot be undone.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiDeleteHabit(id);
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-fail">{error}</p>}
      <div className="grid grid-cols-3 gap-2">
        <Link
          href={`/habits/${id}/edit`}
          className="rounded-btn border border-border bg-surface px-3 py-2.5 text-center text-sm text-text-secondary active:bg-surface2"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={handleArchive}
          disabled={busy}
          className="rounded-btn border border-border bg-surface px-3 py-2.5 text-center text-sm text-text-secondary active:bg-surface2 disabled:opacity-50"
        >
          {archived ? 'Unarchive' : 'Archive'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="rounded-btn border border-fail/40 px-3 py-2.5 text-center text-sm text-fail active:bg-fail/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
