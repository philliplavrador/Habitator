import Link from 'next/link';
import DateNav from '@/components/DateNav';
import TodayClient, { type WidgetItem } from '@/components/TodayClient';
import RepProgramSummary from '@/components/RepProgramSummary';
import PlankProgramSummary from '@/components/PlankProgramSummary';
import AnkiSummary from '@/components/AnkiSummary';
import ScheduledHabitRow from '@/components/ScheduledHabitRow';
import AccountMenu from '@/components/AccountMenu';
import { listActiveHabits } from '@/lib/habits';
import { statusMapForDate, listEntriesForDateRange } from '@/lib/entries';
import { listExceptionsForDate } from '@/lib/exceptions';
import { getCurrentStreaksBatch } from '@/lib/stats';
import { isDueOn, weekStartOf } from '@/lib/schedule';
import { getPushupState } from '@/lib/pushups';
import { getPullupState } from '@/lib/pullups';
import { listRepProgramStates, listRepPrograms } from '@/lib/repPrograms';
import { listPlankProgramStates, listPlankPrograms } from '@/lib/plankPrograms';
import { getAnkiState } from '@/lib/anki';
import { listUserDomains } from '@/lib/domains';
import { requirePageContext } from '@/lib/pageContext';
import { getUsername } from '@/lib/auth';
import {
  MAX_FUTURE_DAYS,
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

  // Selected date: validate, and clamp to the forward window. Looking AHEAD is
  // allowed (see MAX_FUTURE_DAYS) so you can check what's scheduled and plan a
  // rest day; a date beyond the window — or a malformed one — falls back to today.
  const maxDate = addDays(today, MAX_FUTURE_DAYS);
  let selected = searchParams.date ?? today;
  if (!isValidISODate(selected) || compareISO(selected, maxDate) > 0) {
    selected = today;
  }

  // The rep programs are "today" actions (they advance by completed session,
  // not calendar date), so only surface their cards on the current day.
  const isToday = selected === today;
  // A future day is a read-only preview: no entries exist for it, custom habits
  // list by name only, and the rows offer rest-day planning but no pass/fail.
  const isFuture = compareISO(selected, today) > 0;

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
    futureRepPrograms,
    futurePlankPrograms,
    username,
  ] =
    await Promise.all([
      statusMapForDate(userId, selected),
      // Every tracker excused for the selected day, keyed `"${scope}:${ref}"` →
      // reason. Habits and custom habits alike drop out of the "to do" list when
      // excused. Keys: `habit:<id>`, `rep:<key>`, `plank:<key>`, `anki:japanese`.
      listExceptionsForDate(userId, selected),
      listActiveHabits(userId),
      // Pushups/pullups/japanese are opt-in custom habits — nothing is created
      // with the account, so a widget exists only for a domain this user added.
      // Needed today (for the live widget) and on a future day (for the
      // name-only row); a past day shows no custom habits at all.
      isToday || isFuture ? listUserDomains(userId) : Promise.resolve([]),
      // User-defined rep programs (the configurable "template instances") surface
      // the same summary widget as the two built-ins, inline in the habit list.
      isToday ? listRepProgramStates(userId, tz) : Promise.resolve([]),
      // User-defined plank programs — the timed sibling; same inline treatment.
      isToday ? listPlankProgramStates(userId, tz) : Promise.resolve([]),
      // A future day needs names only — these programs advance by completed
      // session, not by date, so there's no honest progress to show for a day
      // that hasn't happened. The raw rows skip every getState computation.
      isFuture ? listRepPrograms(userId) : Promise.resolve([]),
      isFuture ? listPlankPrograms(userId) : Promise.resolve([]),
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
      // `domains` is now also populated on a FUTURE day (for the name-only
      // rows), so these live-state reads must gate on isToday as well — they
      // describe the current day's progress and mean nothing for a later one.
      isToday && domains.has('pushups')
        ? getPushupState(userId, tz)
        : Promise.resolve(null),
      isToday && domains.has('pullups')
        ? getPullupState(userId, tz)
        : Promise.resolve(null),
      isToday && domains.has('japanese')
        ? getAnkiState(userId, tz)
        : Promise.resolve(null),
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
    excepted: exceptionMap.has(`habit:${habit.id}`),
    exceptionReason: exceptionMap.get(`habit:${habit.id}`) ?? null,
  }));

  const prevDate = addDays(selected, -1);
  // Forward navigation runs to the end of the preview window, not to today.
  const nextDate = compareISO(selected, maxDate) < 0 ? addDays(selected, 1) : null;

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
  // A custom habit excused for today reads as done: it sinks into the Completed
  // zone (`completed`) and its widget renders the rest-day state. Keyed by the
  // same `"${scope}:${ref}"` as the exception rows.
  const restedRep = (key: string) => exceptionMap.has(`rep:${key}`);
  const restedPlank = (key: string) => exceptionMap.has(`plank:${key}`);
  const ankiRested = exceptionMap.has('anki:japanese');
  const ankiReason = exceptionMap.get('anki:japanese') ?? null;

  const widgets: WidgetItem[] = [];

  // On a future day the custom habits list by NAME only — same order as their
  // live widgets below, so the day reads the same whichever way you arrive at it.
  // Nothing is `completed` on a day that hasn't happened, so they all stay in the
  // main list. (pushups/pullups aren't in CUSTOM_HABIT_LIBRARY any more — they're
  // legacy domains kept for existing accounts — so their labels live here.)
  if (isFuture) {
    if (domains.has('pushups')) {
      widgets.push({
        key: 'pushups',
        completed: false,
        node: <ScheduledHabitRow name="Pushups" href="/pushups" />,
      });
    }
    if (domains.has('pullups')) {
      widgets.push({
        key: 'pullups',
        completed: false,
        node: <ScheduledHabitRow name="Pullups" href="/pullups" />,
      });
    }
    for (const p of futureRepPrograms) {
      widgets.push({
        key: `rep-${p.id}`,
        completed: false,
        node: <ScheduledHabitRow name={p.name} href={`/rep-programs/${p.id}`} />,
      });
    }
    for (const p of futurePlankPrograms) {
      widgets.push({
        key: `plank-${p.id}`,
        completed: false,
        node: (
          <ScheduledHabitRow name={p.name} href={`/plank-programs/${p.id}`} />
        ),
      });
    }
    if (domains.has('japanese')) {
      widgets.push({
        key: 'japanese',
        completed: false,
        node: <ScheduledHabitRow name="Japanese (Anki)" href="/japanese" />,
      });
    }
  }

  if (pushupState) {
    const rested = restedRep(pushupState.key);
    widgets.push({
      key: 'pushups',
      completed:
        pushupState.programComplete || pushupState.doneToday !== null || rested,
      node: (
        <RepProgramSummary
          state={pushupState}
          deleteEndpoint="/api/domains/pushups"
          today={selected}
          restedToday={rested}
          restReason={exceptionMap.get(`rep:${pushupState.key}`) ?? null}
        />
      ),
    });
  }
  if (pullupState) {
    const rested = restedRep(pullupState.key);
    widgets.push({
      key: 'pullups',
      completed:
        pullupState.programComplete || pullupState.doneToday !== null || rested,
      node: (
        <RepProgramSummary
          state={pullupState}
          deleteEndpoint="/api/domains/pullups"
          today={selected}
          restedToday={rested}
          restReason={exceptionMap.get(`rep:${pullupState.key}`) ?? null}
        />
      ),
    });
  }
  for (const s of userRepStates) {
    const rested = restedRep(s.key);
    widgets.push({
      key: s.basePath,
      completed: s.programComplete || s.doneToday !== null || rested,
      node: (
        <RepProgramSummary
          state={s}
          deleteEndpoint={s.basePath}
          today={selected}
          restedToday={rested}
          restReason={exceptionMap.get(`rep:${s.key}`) ?? null}
        />
      ),
    });
  }
  for (const s of userPlankStates) {
    const rested = restedPlank(s.key);
    widgets.push({
      key: s.basePath,
      completed: s.programComplete || s.doneToday !== null || rested,
      node: (
        <PlankProgramSummary
          state={s}
          deleteEndpoint={s.basePath}
          today={selected}
          restedToday={rested}
          restReason={exceptionMap.get(`plank:${s.key}`) ?? null}
        />
      ),
    });
  }
  if (ankiState) {
    widgets.push({
      key: 'japanese',
      completed: ankiState.goalReached || ankiState.loggedToday || ankiRested,
      node: (
        <AnkiSummary
          state={ankiState}
          deleteEndpoint="/api/domains/japanese"
          today={selected}
          restedToday={ankiRested}
          restReason={ankiReason}
        />
      ),
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

      <TodayClient
        date={selected}
        initialItems={items}
        widgets={widgets}
        isFuture={isFuture}
      />

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
