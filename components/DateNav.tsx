import Link from 'next/link';
import { relativeLabel } from '@/lib/dates';

interface Props {
  date: string;
  prevDate: string;
  /** null when `date` is today — there is no "next" past today. */
  nextDate: string | null;
}

/** ‹  Today  ›  — navigates the selected day via ?date= query param. */
export default function DateNav({ date, prevDate, nextDate }: Props) {
  return (
    <div className="flex items-center justify-between">
      <Link
        href={`/?date=${prevDate}`}
        aria-label="Previous day"
        className="flex h-10 w-10 items-center justify-center rounded-btn border border-border bg-surface text-xl text-text-secondary active:bg-surface2"
      >
        ‹
      </Link>

      <div className="text-center">
        <div className="text-base font-semibold text-text-primary">
          {relativeLabel(date)}
        </div>
        <div className="text-xs text-text-muted">{date}</div>
      </div>

      {nextDate ? (
        <Link
          href={`/?date=${nextDate}`}
          aria-label="Next day"
          className="flex h-10 w-10 items-center justify-center rounded-btn border border-border bg-surface text-xl text-text-secondary active:bg-surface2"
        >
          ›
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-btn border border-transparent text-xl text-text-muted/30"
        >
          ›
        </span>
      )}
    </div>
  );
}
