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
  /**
   * Corner control(s) (e.g. rest + delete). Rendered as a SIBLING of the card's
   * `<Link>`, overlaid top-right — a button nested inside an anchor is invalid
   * HTML and would navigate on tap. The header reserves room via `pr-16`.
   */
  action?: ReactNode;
  /**
   * Excused for the day: the card reads as a rest day (neon-pink badge, its
   * footer replaced by the excused note) and sinks into the Completed zone.
   */
  rested?: boolean;
  /** Optional note shown on the excused footer. */
  restReason?: string | null;
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
  action,
  rested = false,
  restReason,
  children,
}: Props) {
  return (
    <div className="relative mb-4">
      <Link
        href={href}
        className="block rounded-card border border-border bg-surface p-4 shadow-card transition-colors active:bg-surface2"
      >
        <div
          className={`mb-3 flex items-baseline justify-between ${action ? 'pr-20' : ''}`}
        >
          <h2 className="font-display text-base font-bold text-text-primary">{title}</h2>
          <span
            className={`text-xs font-semibold ${rested ? 'text-exception' : 'text-accent-400'}`}
          >
            {rested
              ? 'Rest day'
              : complete
                ? completeBadge
                : badge ?? `${Math.floor(pct)}%`}
          </span>
        </div>

        <ProgressBar
          value={pct / 100}
          tone={rested ? 'accent' : complete ? 'pass' : 'accent'}
        />

        <div className="mt-2 flex items-center justify-between text-xs">
          {rested ? (
            <span className="font-medium text-exception">
              ◆ Rest day{restReason ? ` — ${restReason}` : ''}
            </span>
          ) : (
            children
          )}
          <span className="flex items-center gap-2">
            {!rested && aside}
            <span className="font-semibold text-accent-400">Open →</span>
          </span>
        </div>
      </Link>

      {action && (
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
          {action}
        </div>
      )}
    </div>
  );
}
