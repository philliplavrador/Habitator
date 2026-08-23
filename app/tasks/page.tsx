import Link from 'next/link';
import BackHeader from '@/components/BackHeader';
import DateNav from '@/components/DateNav';
import TasksClient from '@/components/TasksClient';
import { listTasksForDate, openTaskCountsByDate, rollOverTasks } from '@/lib/tasks';
import { requirePageContext } from '@/lib/pageContext';
import {
  MAX_FUTURE_DAYS,
  addDays,
  compareISO,
  formatHuman,
  isValidISODate,
} from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How many days ahead the "coming up" strip previews. */
const AHEAD_PREVIEW = 5;

/**
 * The daily tasks board — one-off to-dos for a given day, the counterpart to
 * the habit board at /today. Tasks are added here or by the chat agent (it
 * writes the `tasks` table directly via run_sql), can be scheduled for a future
 * day and given a time of day, and — the point of the whole thing — an
 * unfinished one CARRIES OVER to the next day instead of being lost.
 *
 * The carry-over sweep runs here, on the first read of the day: see
 * lib/tasks.ts rollOverTasks. It only reaches backward, so a task deliberately
 * parked in the future stays parked.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const { userId, today } = await requirePageContext();

  // Same forward window as the Today screen: you can plan ahead up to
  // MAX_FUTURE_DAYS, and a malformed/out-of-range date falls back to today.
  const maxDate = addDays(today, MAX_FUTURE_DAYS);
  let selected = searchParams.date ?? today;
  if (!isValidISODate(selected) || compareISO(selected, maxDate) > 0) {
    selected = today;
  }

  // Roll first, then read — otherwise yesterday's leftovers would be invisible
  // on today's board until the next request.
  await rollOverTasks(userId, today);
  const [tasks, upcoming] = await Promise.all([
    listTasksForDate(userId, selected),
    openTaskCountsByDate(userId, addDays(today, 1), addDays(today, AHEAD_PREVIEW)),
  ]);

  const prevDate = addDays(selected, -1);
  const nextDate = compareISO(selected, maxDate) < 0 ? addDays(selected, 1) : null;

  // Days in the next few that already have something on them — a nudge that
  // "Wednesday has 3 things" without leaving the current day.
  const ahead = Array.from(upcoming.entries())
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1));

  return (
    <main className="pb-16 pt-4">
      <BackHeader href="/" title="Tasks" className="mb-4" />

      <DateNav
        basePath="/tasks"
        date={selected}
        prevDate={prevDate}
        nextDate={nextDate}
        today={today}
      />

      <TasksClient
        date={selected}
        today={today}
        initialTasks={tasks}
        maxDate={maxDate}
      />

      {ahead.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
            Coming up
          </h2>
          <ul className="flex flex-col gap-1.5">
            {ahead.map(([day, n]) => (
              <li key={day}>
                <Link
                  href={`/tasks?date=${day}`}
                  className="flex items-center justify-between rounded-btn border border-border bg-surface px-3 py-2 text-sm text-text-secondary active:bg-surface2"
                >
                  <span>{formatHuman(day)}</span>
                  <span className="text-xs text-text-muted">
                    {n} task{n === 1 ? '' : 's'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
