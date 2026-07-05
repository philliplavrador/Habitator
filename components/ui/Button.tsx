'use client';

import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-btn font-semibold ' +
  'transition-[background-color,transform,box-shadow,border-color] duration-150 ' +
  'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

const sizes: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-base px-4 py-3.5',
};

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white active:bg-accent-soft',
  secondary:
    'border border-border bg-surface text-text-secondary active:bg-surface2',
  ghost: 'text-text-secondary active:bg-surface2',
  danger: 'border border-fail/40 text-fail active:bg-fail/10',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  glow?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof CommonProps> & { href?: undefined };
type LinkProps = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof CommonProps> & { href: string };

function classes(p: CommonProps) {
  return [
    base,
    sizes[p.size ?? 'md'],
    variants[p.variant ?? 'primary'],
    p.fullWidth ? 'w-full' : '',
    p.glow ? 'shadow-glow-accent' : '',
    p.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
    />
  );
}

/**
 * The one button in the app. Renders a <button> by default, or a Next <Link>
 * when `href` is given. Variants/sizes come from the design tokens so every
 * call site stays consistent — this replaces the copy-pasted class strings.
 */
export default function Button(props: ButtonProps | LinkProps) {
  if ('href' in props && props.href !== undefined) {
    const { variant, size, fullWidth, loading, glow, className, children, ...rest } =
      props as LinkProps;
    return (
      <Link
        className={classes({ variant, size, fullWidth, glow, className, children })}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <Spinner />}
        {children}
      </Link>
    );
  }

  const {
    variant,
    size,
    fullWidth,
    loading,
    glow,
    className,
    children,
    disabled,
    type,
    ...rest
  } = props as ButtonProps;
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes({ variant, size, fullWidth, glow, className, children })}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
