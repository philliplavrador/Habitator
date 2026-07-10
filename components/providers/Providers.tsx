'use client';

import { LazyMotion, MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';

/**
 * The single app-wide client boundary. Keeps pages/layout as Server Components
 * while giving every client component access to reduced-motion honoring
 * (MotionConfig), toasts, and the async confirm dialog.
 *
 * LazyMotion defers the (~heavy) framer-motion feature bundle so it no longer
 * sits in every route's first-load JS: `features` is a dynamic import, so the
 * DOM feature set is code-split into its own async chunk and only fetched once a
 * shell `m.*` component actually animates. This is what lets a motion-free route
 * like /login drop the framer feature bundle from its first load entirely.
 *
 * We load `domMax` (not domAnimation) because the app uses LAYOUT animations —
 * the BottomNav / SegmentedControl `layoutId` pill slides and the toast stack's
 * `layout` reflow — which only domMax provides; domAnimation would silently
 * no-op them.
 *
 * Every animating component in the tree now uses the lightweight `m.*` component
 * (no `motion.*` remains), so the full feature-laden `motion` bundle is
 * tree-shaken out and only the lazily-fetched `domMax` chunk carries features.
 * `strict` is intentionally left off so a `motion.*` (should one be reintroduced)
 * degrades gracefully rather than throwing at runtime.
 */
const loadFeatures = () =>
  import('framer-motion').then((mod) => mod.domMax);

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </MotionConfig>
    </LazyMotion>
  );
}
