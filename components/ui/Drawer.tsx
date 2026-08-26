'use client';

import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Accessible name when there's no visible `title`. */
  label?: string;
  /** Hook for tests / callers that need to grab the panel. */
  testId?: string;
}

/**
 * A side drawer: backdrop + panel that slides in from the LEFT, the way the
 * ChatGPT app's chat list does. The counterpart to `Sheet` (which rises from
 * the bottom) — reach for this one when the panel is a *place* you slide over
 * to, and for `Sheet` when it's a short list of actions on the current screen.
 *
 * Same mechanics as `Sheet`: portaled to `document.body` so `position: fixed`
 * resolves against the viewport rather than any transformed ancestor, closes on
 * Escape or backdrop tap, and locks body scroll while open.
 *
 * The panel is pinned to the left edge of the app's centred `max-w-md` column,
 * not the raw viewport: on a phone those are the same edge, and on a desktop
 * window it keeps the drawer attached to the app instead of stranding it in the
 * margin.
 */
export default function Drawer({ open, onClose, title, children, label, testId }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-50 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div className="pointer-events-none relative w-full max-w-md">
            <m.aside
              role="dialog"
              aria-modal="true"
              aria-label={label ?? (typeof title === 'string' ? title : 'Menu')}
              data-testid={testId}
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="pointer-events-auto absolute inset-y-0 left-0 flex w-[86%] max-w-[300px] flex-col border-r border-border bg-surface3 shadow-card"
            >
              <div className="safe-top flex items-center justify-between gap-2 px-3 pb-1 pt-4">
                {title && (
                  <h2 className="font-display text-base font-bold text-text-primary">
                    {title}
                  </h2>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close menu"
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
              <div className="safe-bottom flex-1 overflow-y-auto px-2 py-2">
                {children}
              </div>
            </m.aside>
          </div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
