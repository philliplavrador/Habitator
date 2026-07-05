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
  surface: '#262a34',
} as const;
