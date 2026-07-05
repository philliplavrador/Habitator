'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * template.tsx re-mounts on every navigation, so this gives each screen a subtle
 * enter animation (fade + slight rise). Enter-only by design — the App Router
 * unmounts the leaving segment before an exit could play, so we don't attempt
 * route-level exit animations. MotionConfig reducedMotion="user" neutralizes
 * this for anyone with the OS "reduce motion" setting on.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
