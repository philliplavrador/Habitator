interface Props {
  /** Fill fraction, 0..1 (clamped). */
  value: number;
  /** Track/fill color intent. */
  tone?: 'accent' | 'pass';
}

/** A thin linear progress bar built from the shared design tokens. */
export default function ProgressBar({ value, tone = 'accent' }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = tone === 'pass' ? 'bg-pass' : 'bg-accent';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
      <div
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
      />
    </div>
  );
}
