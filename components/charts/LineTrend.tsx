'use client';

import dynamic from 'next/dynamic';
import type { LineTrendProps } from './LineTrendImpl';

// Lazy-load the recharts implementation so recharts (~100KB gz) stays out of the
// route's First Load JS. Renders client-side after mount, identical to before.
const Impl = dynamic(() => import('./LineTrendImpl'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-btn bg-surface2/40" />
  ),
});

export default function LineTrend(props: LineTrendProps) {
  return <Impl {...props} />;
}
