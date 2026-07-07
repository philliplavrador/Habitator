import Link from 'next/link';
import type { ReactNode } from 'react';
import ProgressBar from './ProgressBar';

interface Props {
  /** Card title shown in the header. */
  title: string;
  /** Destination for the whole-card link. */
  href: string;
  /** Progress percentage, 0..100 (drives the bar and the default badge). */
  pct: number;
  /** Whether the goal/program is complete (switches tone + badge). */
  complete: boolean;
  /** Header badge when not complete. Defaults to `${Math.floor(pct)}%`. */
  badge?: ReactNode;
  /** Header badge when complete. */
  completeBadge?: ReactNode;
  /** Extra footer-right content shown before the "Open →" link. */
  aside?: ReactNode;
  /** Footer-left content. */
  children: ReactNode;
}

/**
 * Compact, non-interactive Today-screen card that links to a full screen.
 * Renders the shared wrapper, header (title + accent badge), a progress bar
 * whose tone flips to `pass` when complete, and an "Open →" footer. The
 * footer's left slot (`children`) and optional right `aside` are consumer-owned.
 */
export default function SummaryCard({
  title,
  href,
  pct,
  complete,
  badge,
  completeBadge = 'Complete 🎉',
  aside,
  children,
}: Props) {
  return (
    <Link
      href={href}
      className="mb-4 block rounded-card border border-border bg-surface p-4 shadow-card transition-colors active:bg-surface2"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-base font-bold text-text-primary">{title}</h2>
        <span className="text-xs font-semibold text-accent-400">
          {complete ? completeBadge : badge ?? `${Math.floor(pct)}%`}
        </span>
      </div>

      <ProgressBar value={pct / 100} tone={complete ? 'pass' : 'accent'} />

      <div className="mt-2 flex items-center justify-between text-xs">
        {children}
        <span className="flex items-center gap-2">
          {aside}
          <span className="font-semibold text-accent-400">Open →</span>
        </span>
      </div>
    </Link>
  );
}
