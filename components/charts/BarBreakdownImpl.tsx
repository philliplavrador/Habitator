'use client';

import { useReducedMotion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chart } from './theme';
import ChartTooltip from './ChartTooltip';

export interface BarBreakdownProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  xKey: string;
  yKey: string;
  color?: string;
  /**
   * Name of a data field holding a per-bar color. A string (not a function) so
   * it can cross the Server→Client boundary — precompute the color server-side.
   */
  fillKey?: string;
  unit?: string;
}

/** Categorical bar chart (day-of-week, hour-of-day, histograms). */
export default function BarBreakdownImpl({
  data,
  xKey,
  yKey,
  color = chart.accent,
  fillKey,
  unit = '',
}: BarBreakdownProps) {
  const reduced = useReducedMotion();

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-muted">
        Not enough data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={chart.grid} vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: chart.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: chart.grid }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: chart.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={30}
          allowDecimals={false}
        />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        />
        <Bar dataKey={yKey} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} animationDuration={600}>
          {data.map((row, i) => (
            <Cell key={i} fill={fillKey ? (row[fillKey] as string) : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
