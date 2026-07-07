// Shared chart palette, drawn from the Momentum design tokens. Recharts SVG
// fills don't reliably read Tailwind classes, so charts import these hexes.
export const chart = {
  grid: '#242a33',
  axis: '#7c828c',
  accent: '#8b5cf6',
  accentFrom: '#6366f1',
  accentTo: '#a855f7',
  pass: '#22c55e',
  fail: '#ef4444',
  warn: '#f59e0b',
} as const;

/**
 * Color for a weekday/day cell by its completion rate (percent 0..100), or a
 * muted neutral when there's no data. Shared by the insights and habit charts.
 */
export function weekdayColor(rate: number | null): string {
  if (rate === null) return '#2a2f3a';
  if (rate >= 67) return chart.pass;
  if (rate >= 34) return chart.warn;
  return chart.fail;
}
