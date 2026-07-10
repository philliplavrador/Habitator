'use client';

import { AnimatePresence, m } from 'framer-motion';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Sticky action row at the bottom of the sheet. */
  footer?: ReactNode;
}

/**
 * A bottom sheet: backdrop + panel that slides up from the bottom on mobile.
 * Closes on Escape or backdrop tap. Used by ConfirmDialog and the habit
 * calendar day editor. Renders via AnimatePresence so exit animates too.
 */
export default function Sheet({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll while the sheet is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-50 flex items-end justify-center"
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
          <m.div
            role="dialog"
            aria-modal="true"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            className="safe-bottom relative w-full max-w-md rounded-t-lg border border-border border-b-0 bg-surface3 p-4 shadow-card"
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong" />
            {title && (
              <h2 className="mb-3 text-center font-display text-base font-bold text-text-primary">
                {title}
              </h2>
            )}
            {children}
            {footer && <div className="mt-4">{footer}</div>}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
