'use client';

interface Item {
  name?: string;
  value?: number | string;
  color?: string;
}

interface Props {
  active?: boolean;
  payload?: Item[];
  label?: string | number;
  unit?: string;
}

/** Themed tooltip card matching the surface/border tokens. */
export default function ChartTooltip({ active, payload, label, unit = '' }: Props) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-btn border border-border bg-surface3 px-2.5 py-1.5 text-xs shadow-card">
      {label !== undefined && label !== '' && (
        <div className="mb-0.5 text-text-muted">{label}</div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="font-semibold" style={{ color: p.color ?? '#e8eaed' }}>
          {p.name ? `${p.name}: ` : ''}
          {p.value}
          {unit}
        </div>
      ))}
    </div>
  );
}
