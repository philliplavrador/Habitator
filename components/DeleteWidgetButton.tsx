'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { apiDeleteCustomHabit } from '@/lib/client';

interface Props {
  /** Habit name, for the confirm copy and the accessible label. */
  label: string;
  /** DELETE endpoint: `/api/domains/pushups` or `/api/rep-programs/5`. */
  endpoint: string;
}

/**
 * The delete affordance on a Today-screen custom-habit widget (pushups,
 * pullups, japanese, user rep programs). Rendered as a sibling of the card's
 * `<Link>` — never inside it — so tapping it can't also navigate.
 */
export default function DeleteWidgetButton({ label, endpoint }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const { show } = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: `Delete "${label}"?`,
      message:
        'This removes the habit and everything logged in it. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiDeleteCustomHabit(endpoint);
      show({ tone: 'success', title: `${label} deleted.` });
      router.refresh();
    } catch (e) {
      show({
        tone: 'error',
        title: 'Could not delete.',
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={`Delete ${label}`}
      className="flex h-7 w-7 items-center justify-center rounded-full text-text-faint transition-colors active:bg-fail/15 active:text-fail disabled:opacity-40"
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      </svg>
    </button>
  );
}
