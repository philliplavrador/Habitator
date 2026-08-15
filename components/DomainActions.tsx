'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/confirm';
import { apiDeleteCustomHabit } from '@/lib/client';
import type { DomainKey } from '@/lib/domains';

interface Props {
  domain: DomainKey;
  /** Display name, for the confirm copy. */
  label: string;
}

/**
 * The footer delete action for a BUILT-IN custom habit (pushups / pullups /
 * japanese), so it can be removed from its own screen the same way a plain
 * habit is — open it, scroll to the bottom, delete.
 *
 * The user-defined programs get this from `RepProgramActions` /
 * `PlankProgramActions`, which also edit; a built-in has no editable config
 * (its ramp and pace are coded in), so delete is the only action here.
 *
 * `DELETE /api/domains/[domain]` drops the opt-in AND the domain's logged data
 * in one transaction. Every screen that reads a domain guards on
 * `hasUserDomain` and redirects home, so pushing to '/' afterwards is the only
 * navigation needed.
 */
export default function DomainActions({ domain, label }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      await apiDeleteCustomHabit(`/api/domains/${domain}`);
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.');
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border-t border-border pt-4">
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-fail">{error}</p>}
        <Button variant="danger" fullWidth onClick={remove} disabled={busy}>
          Delete habit
        </Button>
      </div>
    </section>
  );
}
