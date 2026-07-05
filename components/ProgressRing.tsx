'use client';

import { motion } from 'framer-motion';
import { useId } from 'react';

interface Props {
  /** Progress toward the goal, 0..1+. Values > 1 are clamped for the arc. */
  progress: number;
  /** True once the goal is reached — turns the arc green and adds a glow. */
  reached: boolean;
  /** Centered content (the live timer, goal label, …). */
  children: React.ReactNode;
  size?: number; // px
  stroke?: number; // px
}

/**
 * SVG circular progress ring with a gradient stroke (indigo→violet, or green
 * once reached), an animated arc, and a soft glow on completion. The arc fills
 * clockwise from the top and caps at 100%. API unchanged from the original so
 * every caller (fast timer, Today hero, pushup progress) shares one ring.
 */
export default function ProgressRing({
  progress,
  reached,
  children,
  size = 224,
  stroke = 14,
}: Props) {
  const gradId = useId();
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            {reached ? (
              <>
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#4ade80" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="55%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#a855f7" />
              </>
            )}
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />

        {/* Progress arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`url(#${gradId})`}
          strokeDasharray={circumference}
          initial={false}
          animate={{
            strokeDashoffset: dashoffset,
            filter: reached
              ? 'drop-shadow(0 0 7px rgba(34,197,94,0.6))'
              : 'drop-shadow(0 0 5px rgba(99,102,241,0.4))',
          }}
          transition={{
            strokeDashoffset: { type: 'spring', stiffness: 120, damping: 22 },
            filter: { duration: 0.4 },
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
