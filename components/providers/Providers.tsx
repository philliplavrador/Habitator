'use client';

import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';

/**
 * The single app-wide client boundary. Keeps pages/layout as Server Components
 * while giving every client component access to reduced-motion honoring
 * (MotionConfig), toasts, and the async confirm dialog.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
