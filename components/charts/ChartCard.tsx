import type { ReactNode } from 'react';
import Card from '@/components/ui/Card';

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Tailwind height for the plot area. */
  height?: string;
  children: ReactNode;
}

/** A titled panel that reserves a fixed plot height (so charts don't cause CLS). */
export default function ChartCard({ title, subtitle, height = 'h-52', children }: Props) {
  return (
    <Card padding="p-3">
      <div className="mb-2 px-1">
        <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
      </div>
      <div className={`${height} w-full`}>{children}</div>
    </Card>
  );
}
