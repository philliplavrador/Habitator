'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiArchiveHabit, apiDeleteHabit } from '@/lib/client';
import Button from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/confirm';

interface Props {
  id: number;
  name: string;
  archived: boolean;
}

/** Edit / Archive-Unarchive / Delete controls for the habit detail page. */
export default function HabitActions({ id, name, archived }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: `Delete "${name}"?`,
      message: 'This removes the habit and all its history. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
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
        <Button href={`/habits/${id}/edit`} variant="secondary" size="md">
          Edit
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={handleArchive}
          disabled={busy}
        >
          {archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button variant="danger" size="md" onClick={handleDelete} disabled={busy}>
          Delete
        </Button>
      </div>
    </div>
  );
}
