'use client';

import { useState } from 'react';
import Sheet from './ui/Sheet';

/**
 * The data affordance on the legacy screens' headers: a small button that opens
 * a bottom sheet with "Export data".
 *
 * There is no log-out here on purpose. Habitator is single-owner — the session
 * cookie exists to keep the public Railway URL from serving the owner's data to
 * strangers, not to switch between people — so an account/sign-out UI was just
 * a button that could only ever lock the owner out of their own app. The login
 * gate itself stays (middleware.ts); only the UI for leaving it is gone.
 */
export default function AccountMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Data"
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
          <path d="M12 3v12" />
          <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Data">
        {/* Plain anchor: /api/export streams a file download (attachment), so a
            normal navigation triggers the save without changing the page. */}
        <a
          href="/api/export"
          className="inline-flex w-full items-center justify-center gap-2 rounded-btn border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors active:bg-surface2"
        >
          Export data
        </a>
      </Sheet>
    </>
  );
}
