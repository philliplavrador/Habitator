'use client';

import { AnimatePresence, m } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: ReactNode;
  /** Set for a route link; otherwise `onSelect` runs on tap. */
  href?: string;
  onSelect?: () => void;
}

interface Props {
  /** Accessible name for the trigger button. */
  label: string;
  icon: ReactNode;
  items: MenuItem[];
  /** Which edge of the trigger the popup hangs from. */
  align?: 'left' | 'right';
  testId?: string;
}

/**
 * A small popup menu anchored to its own trigger button — the "where do you
 * want to go" affordance in the chat header. Deliberately NOT a `Sheet`: this
 * is a two-item jump list, and a full bottom sheet for two links reads as a
 * bigger decision than it is.
 *
 * Renders in flow (absolutely positioned against the trigger) rather than in a
 * portal, so it needs a non-transformed positioned ancestor — the app header
 * qualifies. Closes on Escape, on an outside pointer-down, and on selection.
 */
export default function Menu({ label, icon, items, align = 'right', testId }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface2"
      >
        {icon}
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            aria-label={label}
            data-testid={testId}
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.14 }}
            className={`absolute top-full z-50 mt-2 w-[220px] rounded-card border border-border bg-surface3 p-1 shadow-card ${
              align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'
            }`}
          >
            {items.map((item) => {
              const current = item.href !== undefined && pathname === item.href;
              const inner = (
                <>
                  {item.icon && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary">
                      {item.icon}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-text-primary">
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="truncate text-xs text-text-secondary">{item.hint}</span>
                    )}
                  </span>
                </>
              );
              const className = `flex w-full items-center gap-2.5 rounded-btn px-2 py-2.5 text-left active:bg-surface2 ${
                current ? 'bg-surface2' : ''
              }`;
              return item.href !== undefined ? (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  aria-current={current ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={className}
                >
                  {inner}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect?.();
                  }}
                  className={className}
                >
                  {inner}
                </button>
              );
            })}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
