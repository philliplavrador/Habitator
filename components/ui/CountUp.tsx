'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

interface Props {
  value: number;
  /** Seconds. */
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Animated number that eases from its previous value to the new one. Seeds to
 * the initial value so genuine first mount (and SSR) shows the real number
 * rather than counting up from 0 — it only animates when `value` CHANGES (e.g.
 * ticking a habit shifts the % ring). Jumps straight to the value under reduced
 * motion. Render inside a tabular-nums container so the width doesn't jitter.
 */
export default function CountUp({
  value,
  duration = 0.9,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: Props) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    // First mount already shows the correct value (seeded above) — nothing to
    // animate. Only later value changes should animate.
    if (from.current === value) return;
    if (reduced) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduced]);

  return (
    <span className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
