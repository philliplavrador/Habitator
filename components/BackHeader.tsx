import Link from 'next/link';
import type { ReactNode } from 'react';

// The chevron back-link header copy-pasted across app/habits/new,
// app/habits/[id], and app/habits/[id]/edit. Server-renderable (no client
// state). The back link and chevron ‹ are pixel-identical to the originals; the
// header margin is `mb-6` by default (matches new/edit) and overridable via
// `className` (the detail page uses `mb-5`). When a `right` slot is supplied the
// title truncates and flexes to make room for it (matches the detail page's
// Archived badge); otherwise the title renders plainly.

export interface BackHeaderProps {
  /** Destination of the back link (e.g. "/" or `/habits/${id}`). */
  href: string;
  /** Header title (string or node). */
  title: ReactNode;
  /** Optional right-aligned slot rendered after the title (e.g. a badge). */
  right?: ReactNode;
  /** Wrapper classes; defaults to the new/edit spacing (`mb-6`). */
  className?: string;
}

export default function BackHeader({
  href,
  title,
  right,
  className = 'mb-6',
}: BackHeaderProps) {
  return (
    <header className={`${className} flex items-center gap-3`}>
      <Link
        href={href}
        aria-label="Back"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border border-border text-text-secondary active:bg-surface2"
      >
        ‹
      </Link>
      {right ? (
        <>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-text-primary">
            {title}
          </h1>
          {right}
        </>
      ) : (
        <h1 className="text-lg font-bold text-text-primary">{title}</h1>
      )}
    </header>
  );
}
