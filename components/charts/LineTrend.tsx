'use client';

import { useId } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chart } from './theme';
import { useMounted } from './useMounted';
import ChartTooltip from './ChartTooltip';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  xKey: string;
  yKey: string;
  /** Optional second series drawn as a plain reference line (e.g. target). */
  refKey?: string;
  color?: string;
  unit?: string;
  yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
  name?: string;
}

/**
 * Area trend chart with a gradient fill and an animated draw-on (disabled under
 * reduced motion). Gated on mount so Recharts never renders during SSR.
 */
export default function LineTrend({
  data,
  xKey,
  yKey,
  refKey,
  color = chart.accentTo,
  unit = '',
  yDomain,
  name,
}: Props) {
  const mounted = useMounted();
  const reduced = useReducedMotion();
  const gradId = useId().replace(/:/g, '');

  if (!mounted) return null;
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-text-muted">
        Not enough data yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chart.grid} vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: chart.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: chart.grid }}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: chart.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={34}
          domain={yDomain}
          unit={unit}
          allowDecimals={false}
        />
        <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: chart.grid }} />
        {refKey && (
          <Line
            type="monotone"
            dataKey={refKey}
            name="Target"
            stroke={chart.axis}
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={!reduced}
          />
        )}
        <Area
          type="monotone"
          dataKey={yKey}
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={!reduced}
          animationDuration={600}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
