'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from './ui/Button';
import { Field } from './ui/Field';
import { useConfirm } from './ui/confirm';
import { useToast } from './ui/toast';
import { apiDeletePushups, apiUpdatePushups } from '@/lib/client';
import { formatHuman } from '@/lib/dates';
import type { PushupSession } from '@/lib/types';

/** Editable log of every pushup session, newest first. */
export default function PushupHistory({ sessions }: { sessions: PushupSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold text-text-primary">Session history</h2>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <PushupRow key={s.id} session={s} />
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-muted">
        Editing or deleting a session can shift your current day — progress is the
        count of completed days.
      </p>
    </section>
  );
}

function PushupRow({ session }: { session: PushupSession }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { show } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reps, setReps] = useState<string[]>(session.reps.map(String));

  async function save() {
    const parsed = reps.map((r) => {
      const n = parseInt(r, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    });
    setBusy(true);
    try {
      await apiUpdatePushups(session.id, parsed);
      setEditing(false);
      router.refresh();
    } catch (e) {
      show({
        tone: 'error',
        title: 'Could not save',
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    const ok = await confirm({
      title: 'Delete this session?',
      message: 'This may roll your current program day back.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiDeletePushups(session.id);
      router.refresh();
    } catch (e) {
      show({
        tone: 'error',
        title: 'Could not delete',
        description: e instanceof Error ? e.message : undefined,
      });
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-card border border-border bg-surface p-3 shadow-card">
        <div className="mb-2 text-sm font-semibold text-text-secondary">
          Day {session.day_index} · target {session.target.join(' · ')}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Field
              key={i}
              label={`Set ${i + 1}`}
              type="number"
              inputMode="numeric"
              min={0}
              value={reps[i] ?? ''}
              onChange={(e) => {
                const next = [...reps];
                next[i] = e.target.value;
                setReps(next);
              }}
            />
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" fullWidth onClick={save} loading={busy}>
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            fullWidth
            onClick={() => {
              setEditing(false);
              setReps(session.reps.map(String));
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold text-text-primary">
              Day {session.day_index}
            </span>
            {session.completed ? (
              <span className="rounded-btn bg-pass/15 px-1.5 py-0.5 text-xs font-semibold text-pass">
                ✓ done
              </span>
            ) : (
              <span className="rounded-btn bg-surface2 px-1.5 py-0.5 text-xs text-text-muted">
                incomplete
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm tabular-nums text-text-secondary">
            {session.reps.join(' · ')}{' '}
            <span className="text-text-faint">/ {session.target.join(' · ')}</span>
          </p>
          <p className="text-xs text-text-faint">{formatHuman(session.date)}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={del} disabled={busy}>
            Delete
          </Button>
        </div>
      </div>
    </li>
  );
}
