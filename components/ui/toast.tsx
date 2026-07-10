'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, m } from 'framer-motion';
import type { ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

interface ShowOptions {
  tone?: Tone;
  title: string;
  description?: string;
  /** Milliseconds before auto-dismiss. Default 3500. */
  duration?: number;
}

interface ToastApi {
  show: (opts: ShowOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Toast host + context. Mounted once in Providers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const show = useCallback((opts: ShowOptions) => {
    const id = nextId.current++;
    const item: ToastItem = {
      id,
      tone: opts.tone ?? 'info',
      title: opts.title,
      description: opts.description,
    };
    setItems((cur) => [...cur, item]);
    const timeout = opts.duration ?? 3500;
    setTimeout(() => {
      setItems((cur) => cur.filter((t) => t.id !== id));
    }, timeout);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex w-full max-w-md flex-col items-center gap-2 px-4 pt-2">
        <AnimatePresence>
          {items.map((t) => (
            <m.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              className={`pointer-events-auto w-full rounded-card border px-4 py-3 shadow-card backdrop-blur ${
                t.tone === 'success'
                  ? 'border-pass/40 bg-surface3/95'
                  : t.tone === 'error'
                    ? 'border-fail/40 bg-surface3/95'
                    : 'border-border bg-surface3/95'
              }`}
            >
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="text-base leading-5">
                  {t.tone === 'success' ? '🎉' : t.tone === 'error' ? '⚠️' : '✨'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{t.title}</p>
                  {t.description && (
                    <p className="mt-0.5 text-xs text-text-muted">{t.description}</p>
                  )}
                </div>
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/** Show a transient toast. Safe to call from any client component. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // No provider (shouldn't happen) — degrade to a no-op rather than throw.
    return { show: () => {} };
  }
  return ctx;
}
