'use client';

import { useEffect, useState } from 'react';

/**
 * True only after the first client render. Charts gate their Recharts tree on
 * this so the server renders an empty (height-reserved) box instead of a
 * zero-width ResponsiveContainer — avoiding the classic SSR/hydration mismatch.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
