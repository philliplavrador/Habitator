'use client';

import { motion } from 'framer-motion';
import { useId } from 'react';
import type { ReactNode } from 'react';

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
}

interface Props<T extends string> {
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/**
 * A pill toggle with a sliding active indicator (shared-element via layoutId).
 * Replaces the hand-rolled toggles in FastClient and the old NavTabs look; also
 * used for the Pass/Fail/Clear control in the calendar editor. The indicator
 * animation is automatically neutralized under reduced motion by MotionConfig.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  'aria-label': ariaLabel,
}: Props<T>) {
  const groupId = useId();
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-1 rounded-btn border border-border bg-surface p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 rounded-btn text-center font-semibold transition-colors ${pad} ${
              active ? 'text-white' : 'text-text-secondary active:bg-surface2'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                className="absolute inset-0 -z-0 rounded-btn bg-accent"
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
