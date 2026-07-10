import Link from 'next/link';
import DateNav from '@/components/DateNav';
import TodayClient, { type WidgetItem } from '@/components/TodayClient';
import RepProgramSummary from '@/components/RepProgramSummary';
import AnkiSummary from '@/components/AnkiSummary';
import Footer from '@/components/Footer';
import { listActiveHabits } from '@/lib/habits';
import { statusMapForDate, listEntriesForDateRange } from '@/lib/entries';
import { getCurrentStreaksBatch } from '@/lib/stats';
import { isDueOn, weekStartOf } from '@/lib/schedule';
import { getPushupState } from '@/lib/pushups';
import { getPullupState } from '@/lib/pullups';
import { listRepProgramStates } from '@/lib/repPrograms';
import { getAnkiState } from '@/lib/anki';
import { listUserDomains } from '@/lib/domains';
import { requirePageContext } from '@/lib/pageContext';
import {
  addDays,
  compareISO,
  isValidISODate,
} from '@/lib/dates';
import type { HabitDayView } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TodayPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const { userId, tz, today } = await requirePageContext();

  // Selected date: validate, and never allow navigating past today.
  let selected = searchParams.date ?? today;
  if (!isValidISODate(selected) || compareISO(selected, today) > 0) {
    selected = today;
  }

  const statusMap = await statusMapForDate(userId, selected);
  // Show a habit only on days it's due: daily/weekly every day, weekdays/interval
  // only on their scheduled days (isDueOn also enforces start_date >= selected).
  // An ended habit (end_date set) drops off the board after its end date.
  const dueHabits = (await listActiveHabits(userId)).filter(
    (h) =>
      isDueOn(h.schedule, h.start_date, selected) &&
      (h.end_date === null || compareISO(selected, h.end_date) <= 0)
  );
  const streaks = await getCurrentStreaksBatch(userId, dueHabits, today);

  // Weekly-count habits show this week's progress ("2 / 3 this week") for the
  // week containing the selected day. One extra range query, only if any exist.
  const weeklyDone = new Map<number, number>();
  if (dueHabits.some((h) => h.schedule.kind === 'weekly')) {
    const weekEntries = await listEntriesForDateRange(
      userId,
      weekStartOf(selected),
      selected
    );
    for (const e of weekEntries) {
      if (e.status === 'pass') {
        weeklyDone.set(e.habit_id, (weeklyDone.get(e.habit_id) ?? 0) + 1);
      }
    }
  }

  const items: HabitDayView[] = dueHabits.map((habit) => ({
    habit,
    status: statusMap.get(habit.id) ?? null,
    currentStreak: streaks.get(habit.id) ?? 0,
    weekly:
      habit.schedule.kind === 'weekly'
        ? { done: weeklyDone.get(habit.id) ?? 0, target: habit.schedule.count }
        : undefined,
  }));

  const prevDate = addDays(selected, -1);
  const nextDate = compareISO(selected, today) < 0 ? addDays(selected, 1) : null;

  // The rep programs are "today" actions (they advance by completed session,
  // not calendar date), so only surface their cards on the current day.
  const isToday = selected === today;
  // Pushups/pullups/japanese are opt-in custom habits — nothing is created with
  // the account, so a widget exists only for a domain this user actually added.
  const domains = new Set(
    isToday ? (await listUserDomains(userId)).map((d) => d.domain) : []
  );
  const pushupState = domains.has('pushups')
    ? await getPushupState(userId, tz)
    : null;
  const pullupState = domains.has('pullups')
    ? await getPullupState(userId, tz)
    : null;
  // User-defined rep programs (the configurable "template instances") surface the
  // same summary widget as the two built-ins, inline in the habit list.
  const userRepStates = isToday ? await listRepProgramStates(userId, tz) : [];
  const ankiState = domains.has('japanese') ? await getAnkiState(userId, tz) : null;

  // Pushups/pullups/japanese/custom rep programs are custom habits, not separate
  // destinations, so their summary widgets flow inline with the habit list
  // rather than being pinned above it. (Data lives in its own domains; only the
  // presentation is unified.) Each widget carries a `completed` flag so that —
  // exactly like an ordinary habit — a done one sinks into the "Completed"
  // section instead of cluttering the active list. Rendered server-side and
  // handed to TodayClient.
  // Each widget also carries a `deleteEndpoint` — a custom habit is deletable
  // from Today like any other habit. Built-in domains delete via /api/domains/*;
  // a user rep program deletes via its own /api/rep-programs/<id> (= basePath).
  const widgets: WidgetItem[] = [];
  if (pushupState) {
    widgets.push({
      key: 'pushups',
      completed: pushupState.programComplete || pushupState.doneToday !== null,
      node: (
        <RepProgramSummary state={pushupState} deleteEndpoint="/api/domains/pushups" />
      ),
    });
  }
  if (pullupState) {
    widgets.push({
      key: 'pullups',
      completed: pullupState.programComplete || pullupState.doneToday !== null,
      node: (
        <RepProgramSummary state={pullupState} deleteEndpoint="/api/domains/pullups" />
      ),
    });
  }
  for (const s of userRepStates) {
    widgets.push({
      key: s.basePath,
      completed: s.programComplete || s.doneToday !== null,
      node: <RepProgramSummary state={s} deleteEndpoint={s.basePath} />,
    });
  }
  if (ankiState) {
    widgets.push({
      key: 'japanese',
      completed: ankiState.goalReached || ankiState.loggedToday,
      node: <AnkiSummary state={ankiState} deleteEndpoint="/api/domains/japanese" />,
    });
  }

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="mb-4 text-center font-display text-xl font-bold tracking-tight text-gradient">
          Habitator
        </h1>
        <DateNav date={selected} prevDate={prevDate} nextDate={nextDate} today={today} />
      </header>

      <TodayClient date={selected} initialItems={items} widgets={widgets} />

      <Footer />

      {/* Floating add button — adding a habit is always one tap away. Sits above
          the bottom nav and aligns to the phone column on any viewport. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center">
        <div className="relative w-full max-w-md">
          <Link
            href="/habits/new"
            aria-label="Add habit"
            className="pointer-events-auto absolute right-4 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] flex h-14 w-14 items-center justify-center rounded-full bg-accent-grad text-white shadow-glow-accent transition-transform active:scale-95"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
