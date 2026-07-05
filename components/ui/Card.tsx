import type { ElementType, ReactNode } from 'react';

const elevations: Record<1 | 2 | 3, string> = {
  1: 'bg-surface',
  2: 'bg-surface2',
  3: 'bg-surface3',
};

interface Props {
  elevation?: 1 | 2 | 3;
  /** Tailwind padding utility; pass '' to opt out (e.g. media that bleeds). */
  padding?: string;
  glow?: boolean;
  shadow?: boolean;
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

/**
 * The standard surface panel. Replaces the repeated
 * `rounded-card border border-border bg-surface p-4` strings across the app.
 */
export default function Card({
  elevation = 1,
  padding = 'p-4',
  glow = false,
  shadow = true,
  as: Tag = 'div',
  className = '',
  children,
}: Props) {
  return (
    <Tag
      className={[
        'rounded-card border border-border',
        elevations[elevation],
        padding,
        shadow ? 'shadow-card' : '',
        glow ? 'glow-accent' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Tag>
  );
}
