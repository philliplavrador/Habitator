'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RestDaySheet from './RestDaySheet';
import { useToast } from '@/components/ui/toast';
import { apiClearException, apiSetException } from '@/lib/client';

interface Props {
  /** Tracker scope — 'rep' | 'plank' | 'anki'. */
  scope: string;
  /** Tracker ref — a rep/plank program key, or 'japanese'. */
  refId: string;
  /** The day to excuse (the Today screen's selected day). */
  date: string;
  /** Human date for the reason prompt. */
  dateLabel?: string;
  /** Whether this tracker is already excused for `date`. */
  restedToday: boolean;
  /** Tracker name — for the accessible label. */
  label: string;
}

/**
 * The rest-day affordance on a Today-screen custom-habit widget — the parity of
 * the ◆ rest button on a plain-habit row. Tapping it marks TODAY as a rest day
 * (prompting for a reason first) so the widget drops out of the day's "to do"
 * list; tapping an already-excused widget clears it. Rendered as a sibling of
 * the card's `<Link>` (never inside it) so the tap can't also navigate.
 */
export default function RestWidgetButton({
  scope,
  refId,
  date,
  dateLabel,
  restedToday,
  label,
}: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function mark(reason: string) {
    setBusy(true);
    try {
      await apiSetException(scope, refId, date, reason || undefined);
      setOpen(false);
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

  async function clear() {
    setBusy(true);
    try {
      await apiClearException(scope, refId, date);
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

  return (
    <>
      <button
        type="button"
        onClick={() => (restedToday ? clear() : setOpen(true))}
        disabled={busy}
        aria-label={
          restedToday
            ? `Undo rest day for ${label}`
            : `Mark a rest day for ${label}`
        }
        aria-pressed={restedToday}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors disabled:opacity-40 ${
          restedToday
            ? 'text-exception'
            : 'text-text-faint active:bg-exception/15 active:text-exception'
        }`}
      >
        ◆
      </button>
      <RestDaySheet
        open={open}
        dateLabel={dateLabel}
        saving={busy}
        onSave={mark}
        onClose={() => !busy && setOpen(false)}
      />
    </>
  );
}
