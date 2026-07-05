'use client';

import { useId } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

const fieldBase =
  'w-full rounded-btn border border-border bg-surface px-3 py-2.5 text-text-primary ' +
  'placeholder:text-text-muted outline-none transition-colors focus:border-accent ' +
  'disabled:opacity-50';

export const fieldClass = fieldBase;

interface Shared {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Small print rendered under the control (e.g. a computed duration). */
  footer?: ReactNode;
}

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-text-secondary"
    >
      {children}
    </label>
  );
}

function Meta({ error, hint, footer }: Pick<Shared, 'error' | 'hint' | 'footer'>) {
  return (
    <>
      {error ? (
        <p className="mt-1.5 text-sm text-fail">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
      ) : null}
      {footer}
    </>
  );
}

type InputProps = Shared &
  Omit<ComponentPropsWithoutRef<'input'>, keyof Shared> & { id?: string };

/** Labeled text/number/date input built on the shared field style. */
export function Field({ label, hint, error, footer, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div>
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <input
        id={inputId}
        className={`${fieldBase} ${error ? 'border-fail focus:border-fail' : ''} ${className ?? ''}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      <Meta error={error} hint={hint} footer={footer} />
    </div>
  );
}

type TextareaProps = Shared &
  Omit<ComponentPropsWithoutRef<'textarea'>, keyof Shared> & { id?: string };

/** Labeled textarea with the same field style + a comfortable min height. */
export function Textarea({ label, hint, error, footer, id, className, ...rest }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div>
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <textarea
        id={inputId}
        className={`${fieldBase} min-h-[80px] resize-y ${error ? 'border-fail focus:border-fail' : ''} ${className ?? ''}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      <Meta error={error} hint={hint} footer={footer} />
    </div>
  );
}
