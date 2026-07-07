'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useConfirm } from '@/components/ui/confirm';
import { apiDeleteRepProgram, apiUpdateRepProgram } from '@/lib/client';

interface Props {
  id: number;
  name: string;
  restSeconds: number;
}

/**
 * Edit (name + rest) and delete actions for a user-defined rep program, shown
 * at the bottom of its screen. The ramp (sets / day-1 total / length) is frozen
 * after creation — changing it would rewrite every logged session's target — so
 * only the cosmetic/behavioral fields are editable here.
 */
export default function RepProgramActions({ id, name, restSeconds }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(name);
  const [rest, setRest] = useState(String(restSeconds));
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
      await apiUpdateRepProgram(id, {
        name: nameVal.trim(),
        rest_seconds: Math.max(0, Math.min(3600, Math.floor(Number(rest) || 0))),
      });
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
      await apiDeleteRepProgram(id);
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
          <Field
            label="Rest between sets (seconds)"
            type="number"
            min={0}
            max={3600}
            value={rest}
            onChange={(e) => setRest(e.target.value)}
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
                setRest(String(restSeconds));
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
