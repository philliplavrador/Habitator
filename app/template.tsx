'use client';

import { m } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * template.tsx re-mounts on every navigation, so this gives each screen a subtle
 * enter animation (opacity-only fade). Enter-only by design — the App Router
 * unmounts the leaving segment before an exit could play, so we don't attempt
 * route-level exit animations. MotionConfig reducedMotion="user" neutralizes
 * this for anyone with the OS "reduce motion" setting on.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
    >
      {children}
    </m.div>
  );
}
