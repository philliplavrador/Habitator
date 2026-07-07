'use client';

import type { ReactNode } from 'react';
import ProgressBar from './ProgressBar';
import Button from './ui/Button';
import { cx } from './ui/cx';

/**
 * The byte-identical numeric input style shared by the hero "log a number"
 * cards (rep programs + the Anki deck). Centered, large, on surface2.
 */
export const heroInputClass =
  'w-full rounded-btn border border-border bg-surface2 px-3 py-2.5 text-center text-lg font-semibold text-text-primary outline-none focus:border-accent';

/** Config for the shared single-input + submit row. */
export interface HeroLogInput {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: ReactNode;
  /** Small, centered label rendered above the input. */
  label?: ReactNode;
  id?: string;
  min?: number;
  placeholder?: string;
  /** Shows a spinner-free "Saving…" label and blocks submit. */
  busy?: boolean;
  /** Extra disabled condition (e.g. an unparseable value). */
  disabled?: boolean;
  /** Small print under the input (e.g. a below-minimum warning). */
  note?: ReactNode;
  error?: string | null;
}

interface Props {
  title: ReactNode;
  badge: ReactNode;
  /** Progress fill, 0..1. */
  pct: number;
  tone?: 'accent' | 'pass';
  /** Line rendered directly under the progress bar (owns its own margin). */
  subtext?: ReactNode;
  /** Extra body content below the subtext (custom controls, messages). */
  children?: ReactNode;
  /** When present, renders the shared numeric input + submit row. */
  input?: HeroLogInput;
  /** Use the display font + card shadow (the Anki hero styling). */
  display?: boolean;
}

/**
 * Shared shell for the app's hero interactive "log a number" cards: a
 * title + pct badge header, a progress bar, an optional subtext line, and
 * either a custom body (`children`) or the standard numeric input + submit row
 * (`input`). Kept visually identical to the cards it replaced; the celebration
 * flow itself stays in each card so their distinct toasts/triggers are
 * preserved.
 */
export default function HeroLogCard({
  title,
  badge,
  pct,
  tone = 'accent',
  subtext,
  children,
  input,
  display = false,
}: Props) {
  return (
    <section
      className={cx(
        'mb-4 rounded-card border border-border bg-surface p-4',
        display && 'shadow-card'
      )}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className={cx('text-base font-bold text-text-primary', display && 'font-display')}
        >
          {title}
        </h2>
        <span
          className={cx('text-xs font-semibold', display ? 'text-accent-400' : 'text-accent')}
        >
          {badge}
        </span>
      </div>

      <ProgressBar value={pct} tone={tone} />
      {subtext}
      {children}
      {input && <HeroInputRow {...input} />}
    </section>
  );
}

function HeroInputRow({
  value,
  onChange,
  onSubmit,
  submitLabel,
  label,
  id,
  min,
  placeholder,
  busy,
  disabled,
  note,
  error,
}: HeroLogInput) {
  return (
    <div className="mt-3">
      {label != null && (
        <label htmlFor={id} className="mb-1 block text-center text-xs text-text-muted">
          {label}
        </label>
      )}
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        className={heroInputClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {note}
      {error && <p className="mt-1 text-center text-sm text-fail">{error}</p>}
      <Button
        fullWidth
        size="lg"
        className="mt-2"
        disabled={busy || disabled}
        onClick={onSubmit}
      >
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </div>
  );
}
