import Link from 'next/link';
import { rowShellClass } from './HabitRow';

interface Props {
  name: string;
  /** The custom habit's full screen. */
  href: string;
}

/**
 * A custom habit (rep program / plank program / Anki goal) as it appears on a
 * FUTURE day: name only.
 *
 * These domains advance by completed session, not by calendar date, so their
 * summary widgets can't honestly say anything about a day that hasn't happened —
 * "Week 3 · Day 2" would be a guess that's wrong the moment a session is
 * skipped. The day still lists them so "what am I on the hook for Thursday" has
 * a complete answer; the numbers wait until the day arrives.
 *
 * Wears `rowShellClass` (a `div`, not the `li` of HabitRow) so it lines up with
 * the habit rows it sits among — the widgets aren't rendered inside a list.
 */
export default function ScheduledHabitRow({ name, href }: Props) {
  return (
    <div className={rowShellClass}>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-[15px] font-medium text-text-primary active:opacity-70"
        >
          {name}
        </Link>
        <span className="mt-0.5 inline-block text-xs text-text-muted">
          Scheduled
        </span>
      </div>
    </div>
  );
}
