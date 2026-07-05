'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Sheet from './Sheet';
import Button from './Button';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface State extends ConfirmOptions {
  open: boolean;
}

/**
 * Provides an async confirm() that resolves true/false — a themed replacement
 * for window.confirm(). Mounted once in Providers; one dialog at a time.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ open: false, title: '' });
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setState({ ...opts, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setState((s) => ({ ...s, open: false }));
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Sheet
        open={state.open}
        onClose={() => settle(false)}
        title={state.title}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => settle(false)}
            >
              {state.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={state.danger ? 'danger' : 'primary'}
              fullWidth
              onClick={() => settle(true)}
            >
              {state.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        }
      >
        {state.message && (
          <p className="text-center text-sm text-text-secondary">{state.message}</p>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

/** Returns confirm(opts) → Promise<boolean>. Replaces window.confirm. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback to the native dialog if the provider is missing.
    return (opts) => Promise.resolve(window.confirm(opts.title));
  }
  return ctx;
}
