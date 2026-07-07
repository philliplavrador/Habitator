'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Button from './ui/Button';
import { useConfirm } from './ui/confirm';
import { useToast } from './ui/toast';

/** Context handed to `extraActions` so extra controls can share the row's
 *  busy flag + async runner (used by RepProgramHistory's video controls). */
export interface ExtraActionsCtx {
  busy: boolean;
  /** Run an async action inside the row's busy/error machine. */
  run: (
    fn: () => Promise<void>,
    opts: { errorTitle: string; onFinally?: () => void },
  ) => Promise<void>;
}

interface Props {
  /** Left-hand content of the read view (wrapped in a `min-w-0` container). */
  read: ReactNode;
  /** Edit-form content rendered above the shared Save/Cancel controls. */
  editForm: ReactNode;
  /** Persist the edit. Throw to surface an error toast and stay in edit view.
   *  Any resolved value is awaited and discarded (client helpers return the
   *  refreshed state), so `Promise<unknown>` is accepted. */
  onSave: () => Promise<unknown>;
  /** Delete the row. Runs only after the confirm gate resolves true. Resolved
   *  value is awaited and discarded. */
  onDelete: () => Promise<unknown>;
  /** Reset local field state when the edit is cancelled. */
  onCancel?: () => void;
  /** Copy for the confirm-gated delete. */
  confirmCopy: { title: string; message: ReactNode; confirmLabel?: string };
  /** Extra read-view controls that share the row's busy state (e.g. video). */
  extraActions?: (ctx: ExtraActionsCtx) => ReactNode;
  /** Vertical alignment of the read-view header row. */
  readAlign?: 'start' | 'center';
  /** Omit the card shadow on the read view (matches FastHistory). */
  flatRead?: boolean;
  saveErrorTitle?: string;
  deleteErrorTitle?: string;
}

/**
 * The one editable history row: owns the editing/busy state machine, the
 * Edit/Delete/Save/Cancel controls, the confirm-gated delete, and the
 * router.refresh() on success. Errors surface via toast(). Consumers own their
 * field state and supply the read view + edit form via slots.
 */
export default function EditableHistoryRow({
  read,
  editForm,
  onSave,
  onDelete,
  onCancel,
  confirmCopy,
  extraActions,
  readAlign = 'start',
  flatRead = false,
  saveErrorTitle = 'Could not save',
  deleteErrorTitle = 'Could not delete',
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const { show } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback<ExtraActionsCtx['run']>(
    async (fn, opts) => {
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        show({
          tone: 'error',
          title: opts.errorTitle,
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setBusy(false);
        opts.onFinally?.();
      }
    },
    [show],
  );

  async function handleSave() {
    setBusy(true);
    try {
      await onSave();
      setEditing(false);
      router.refresh();
    } catch (e) {
      show({
        tone: 'error',
        title: saveErrorTitle,
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    onCancel?.();
    setEditing(false);
  }

  async function handleDelete() {
    const ok = await confirm({
      title: confirmCopy.title,
      message: confirmCopy.message,
      confirmLabel: confirmCopy.confirmLabel ?? 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onDelete();
      router.refresh();
    } catch (e) {
      show({
        tone: 'error',
        title: deleteErrorTitle,
        description: e instanceof Error ? e.message : undefined,
      });
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="rounded-card border border-border bg-surface p-3 shadow-card">
        {editForm}
        <div className="mt-3 flex gap-2">
          <Button size="sm" fullWidth onClick={handleSave} loading={busy}>
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            fullWidth
            onClick={handleCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`rounded-card border border-border bg-surface p-3${
        flatRead ? '' : ' shadow-card'
      }`}
    >
      <div
        className={`flex ${
          readAlign === 'center' ? 'items-center' : 'items-start'
        } justify-between gap-3`}
      >
        <div className="min-w-0">{read}</div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="danger" onClick={handleDelete} disabled={busy}>
            Delete
          </Button>
        </div>
      </div>
      {extraActions?.({ busy, run })}
    </li>
  );
}
