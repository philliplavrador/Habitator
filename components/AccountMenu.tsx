'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sheet from './ui/Sheet';
import Button from './ui/Button';
import { apiLogout } from '@/lib/client';

/**
 * The account affordance: a small person-icon button (top-right of the main
 * screens' headers) that opens a bottom sheet showing who you're signed in as,
 * plus "Export data" and a prominent "Log out". Replaces the easy-to-miss muted
 * footer link — sign-out is now one obvious tap from Today / Insights / Fasting.
 */
export default function AccountMenu({ username }: { username: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await apiLogout();
    } catch {
      /* ignore — we redirect to /login regardless */
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Account"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors active:bg-surface2"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Account">
        <p className="text-center text-sm text-text-muted">
          Signed in as{' '}
          <span className="font-semibold text-text-secondary">{username}</span>
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {/* Plain anchor: /api/export streams a file download (attachment), so a
              normal navigation triggers the save without changing the page. */}
          <a
            href="/api/export"
            className="inline-flex w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors active:bg-surface2"
          >
            Export data
          </a>
          <Button
            variant="danger"
            fullWidth
            loading={busy}
            onClick={handleLogout}
          >
            Log out
          </Button>
        </div>
      </Sheet>
    </>
  );
}
