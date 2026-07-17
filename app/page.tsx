import Link from 'next/link';
import DateNav from '@/components/DateNav';
import TodayClient, { type WidgetItem } from '@/components/TodayClient';
import RepProgramSummary from '@/components/RepProgramSummary';
import PlankProgramSummary from '@/components/PlankProgramSummary';
import AnkiSummary from '@/components/AnkiSummary';
import AccountMenu from '@/components/AccountMenu';
import { listActiveHabits } from '@/lib/habits';
import { statusMapForDate, listEntriesForDateRange } from '@/lib/entries';
import { listHabitExceptionsForDate } from '@/lib/exceptions';
import { getCurrentStreaksBatch } from '@/lib/stats';
import { isDueOn, weekStartOf } from '@/lib/schedule';
import { getPushupState } from '@/lib/pushups';
import { getPullupState } from '@/lib/pullups';
import { listRepProgramStates } from '@/lib/repPrograms';
import { listPlankProgramStates } from '@/lib/plankPrograms';
import { getAnkiState } from '@/lib/anki';
import { listUserDomains } from '@/lib/domains';
import { requirePageContext } from '@/lib/pageContext';
import { getUsername } from '@/lib/auth';
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

  // The rep programs are "today" actions (they advance by completed session,
  // not calendar date), so only surface their cards on the current day.
  const isToday = selected === today;

  // Wave 1 — reads that don't depend on the habit list. `statusMap` and the
  // active-habit list come back together; the "today-only" reads (user_domains,
  // user rep-program states, user plank-program states) are gated to the current day.
  const [
    statusMap,
    exceptionMap,
    allHabits,
    domainsList,
    userRepStates,
    userPlankStates,
    username,
  ] =
    await Promise.all([
      statusMapForDate(userId, selected),
      // Habits excused for the selected day — they drop out of the "to do" list.
      listHabitExceptionsForDate(userId, selected),
      listActiveHabits(userId),
      // Pushups/pullups/japanese are opt-in custom habits — nothing is created
      // with the account, so a widget exists only for a domain this user added.
      isToday ? listUserDomains(userId) : Promise.resolve([]),
      // User-defined rep programs (the configurable "template instances") surface
      // the same summary widget as the two built-ins, inline in the habit list.
      isToday ? listRepProgramStates(userId, tz) : Promise.resolve([]),
      // User-defined plank programs — the timed sibling; same inline treatment.
      isToday ? listPlankProgramStates(userId, tz) : Promise.resolve([]),
      getUsername(userId),
    ]);

  // Show a habit only on days it's due: daily/weekly every day, weekdays/interval
  // only on their scheduled days (isDueOn also enforces start_date >= selected).
  // An ended habit (end_date set) drops off the board after its end date.
  const dueHabits = allHabits.filter(
    (h) =>
      isDueOn(h.schedule, h.start_date, selected) &&
      (h.end_date === null || compareISO(selected, h.end_date) <= 0)
  );
  const domains = new Set(domainsList.map((d) => d.domain));
  // Weekly-count habits show this week's progress ("2 / 3 this week"); the extra
  // range read only fires when at least one weekly habit is due.
  const needWeekly = dueHabits.some((h) => h.schedule.kind === 'weekly');

  // Wave 2 — reads that depend on `dueHabits` / `domains`. The streak batch
  // needs the due-habit list; the built-in domain states are gated to added
  // domains, exactly as before.
  const [streaks, weekEntries, pushupState, pullupState, ankiState] =
    await Promise.all([
      getCurrentStreaksBatch(userId, dueHabits, today),
      needWeekly
        ? listEntriesForDateRange(userId, weekStartOf(selected), selected)
        : Promise.resolve([]),
      domains.has('pushups') ? getPushupState(userId, tz) : Promise.resolve(null),
      domains.has('pullups') ? getPullupState(userId, tz) : Promise.resolve(null),
      domains.has('japanese') ? getAnkiState(userId, tz) : Promise.resolve(null),
    ]);

  // Weekly-count progress for the week containing the selected day.
  const weeklyDone = new Map<number, number>();
  for (const e of weekEntries) {
    if (e.status === 'pass') {
      weeklyDone.set(e.habit_id, (weeklyDone.get(e.habit_id) ?? 0) + 1);
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
    excepted: exceptionMap.has(habit.id),
    exceptionReason: exceptionMap.get(habit.id) ?? null,
  }));

  const prevDate = addDays(selected, -1);
  const nextDate = compareISO(selected, today) < 0 ? addDays(selected, 1) : null;

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
  for (const s of userPlankStates) {
    widgets.push({
      key: s.basePath,
      completed: s.programComplete || s.doneToday !== null,
      node: <PlankProgramSummary state={s} deleteEndpoint={s.basePath} />,
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
        <div className="relative mb-4 flex items-center justify-center">
          <h1 className="text-center font-display text-xl font-bold tracking-tight text-gradient">
            Habitator
          </h1>
          <div className="absolute inset-y-0 right-0 flex items-center">
            <AccountMenu username={username ?? ''} />
          </div>
        </div>
        <DateNav date={selected} prevDate={prevDate} nextDate={nextDate} today={today} />
      </header>

      <TodayClient date={selected} initialItems={items} widgets={widgets} />

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
