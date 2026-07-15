'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/confirm';
import { apiDeletePlankProgram, apiUpdatePlankProgram } from '@/lib/client';

interface Props {
  id: number;
  name: string;
}

/**
 * Edit (name) and delete actions for a plank program, shown at the bottom of its
 * screen. The ramp (start / end / step) is frozen after creation — changing it
 * would rewrite every logged session's target — so only the name is editable.
 */
export default function PlankProgramActions({ id, name }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (nameVal.trim() === '') {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiUpdatePlankProgram(id, { name: nameVal.trim() });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      message:
        'This removes the program and all its logged sessions and videos. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiDeletePlankProgram(id);
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border-t border-border pt-4">
      {editing ? (
        <div className="flex flex-col gap-3">
          <Field
            label="Name"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            maxLength={200}
          />
          {error && <p className="text-sm text-fail">{error}</p>}
          <div className="flex gap-2">
            <Button fullWidth onClick={save} loading={busy}>
              Save
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setEditing(false);
                setNameVal(name);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm text-fail">{error}</p>}
          <Button variant="secondary" fullWidth onClick={() => setEditing(true)}>
            Edit program
          </Button>
          <Button variant="danger" fullWidth onClick={remove} disabled={busy}>
            Delete program
          </Button>
        </div>
      )}
    </section>
  );
}
