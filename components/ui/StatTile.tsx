import type { ReactNode } from 'react';

type Accent = 'pass' | 'fail' | 'accent';

const accentClass: Record<Accent, string> = {
  pass: 'text-pass',
  fail: 'text-fail',
  accent: 'text-text-primary',
};

interface Props {
  label: string;
  /** A string, or a <CountUp> / node for animated values. */
  value: ReactNode;
  accent?: Accent;
  /** Optional secondary line under the value (e.g. "of 97"). */
  sub?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * A single stat tile: big value + small label, centered. Evolves the old
 * StatCard — same (label, value, accent) API plus optional icon/sub — and uses
 * the display face with tabular numerals so figures align across a grid.
 */
export default function StatTile({
  label,
  value,
  accent = 'accent',
  sub,
  icon,
  className = '',
}: Props) {
  return (
    <div
      className={`rounded-card border border-border bg-surface px-3 py-4 text-center shadow-card ${className}`}
    >
      {icon && <div className="mb-1 flex justify-center text-text-muted">{icon}</div>}
      <div
        className={`font-display text-2xl font-bold tabular-nums ${accentClass[accent]}`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-text-muted">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-text-faint">{sub}</div>}
    </div>
  );
}
