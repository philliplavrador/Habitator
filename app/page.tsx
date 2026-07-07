import Link from 'next/link';
import DateNav from '@/components/DateNav';
import TodayClient from '@/components/TodayClient';
import RepProgramSummary from '@/components/RepProgramSummary';
import AnkiSummary from '@/components/AnkiSummary';
import Footer from '@/components/Footer';
import { listActiveHabits } from '@/lib/habits';
import { statusMapForDate } from '@/lib/entries';
import { getCurrentStreaksBatch } from '@/lib/stats';
import { getPushupState } from '@/lib/pushups';
import { getPullupState } from '@/lib/pullups';
import { getAnkiState } from '@/lib/anki';
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
  const activeHabits = (await listActiveHabits(userId)).filter(
    (h) => compareISO(h.start_date, selected) <= 0
  );
  const streaks = await getCurrentStreaksBatch(userId, activeHabits);
  const items: HabitDayView[] = activeHabits.map((habit) => ({
    habit,
    status: statusMap.get(habit.id) ?? null,
    currentStreak: streaks.get(habit.id) ?? 0,
  }));

  const prevDate = addDays(selected, -1);
  const nextDate = compareISO(selected, today) < 0 ? addDays(selected, 1) : null;

  // The rep programs are "today" actions (they advance by completed session,
  // not calendar date), so only surface their cards on the current day.
  const isToday = selected === today;
  const pushupState = isToday ? await getPushupState(userId, tz) : null;
  const pullupState = isToday ? await getPullupState(userId, tz) : null;
  const ankiState = isToday ? await getAnkiState(userId, tz) : null;

  // Pushups/pullups/japanese are custom habits, not separate destinations, so
  // their summary widgets flow inline with the habit list rather than being
  // pinned above it. (Data lives in its own domains; only the presentation is
  // unified.) Rendered server-side and handed to TodayClient as a prop.
  const widgets =
    pushupState || pullupState || ankiState ? (
      <>
        {pushupState && <RepProgramSummary state={pushupState} />}
        {pullupState && <RepProgramSummary state={pullupState} />}
        {ankiState && <AnkiSummary state={ankiState} />}
      </>
    ) : null;

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
