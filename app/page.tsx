import Link from 'next/link';
import DateNav from '@/components/DateNav';
import TodayClient from '@/components/TodayClient';
import PushupSummary from '@/components/PushupSummary';
import AnkiSummary from '@/components/AnkiSummary';
import Footer from '@/components/Footer';
import { listActiveHabits } from '@/lib/habits';
import { statusMapForDate } from '@/lib/entries';
import { getCurrentStreak } from '@/lib/stats';
import { getPushupState } from '@/lib/pushups';
import { getAnkiState } from '@/lib/anki';
import {
  addDays,
  compareISO,
  isValidISODate,
  todayISO,
} from '@/lib/dates';
import { getTimezone } from '@/lib/tz';
import type { HabitDayView } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function TodayPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const tz = getTimezone();
  const today = todayISO(tz);

  // Selected date: validate, and never allow navigating past today.
  let selected = searchParams.date ?? today;
  if (!isValidISODate(selected) || compareISO(selected, today) > 0) {
    selected = today;
  }

  const statusMap = statusMapForDate(selected);
  const items: HabitDayView[] = listActiveHabits()
    .filter((h) => compareISO(h.start_date, selected) <= 0)
    .map((habit) => ({
      habit,
      status: statusMap.get(habit.id) ?? null,
      currentStreak: getCurrentStreak(habit.id),
    }));

  const prevDate = addDays(selected, -1);
  const nextDate = compareISO(selected, today) < 0 ? addDays(selected, 1) : null;

  // The pushup program is a "today" action (it advances by completed session,
  // not calendar date), so only surface its card on the current day.
  const isToday = selected === today;
  const pushupState = isToday ? getPushupState(tz) : null;
  const ankiState = isToday ? getAnkiState(tz) : null;

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="mb-4 text-center font-display text-xl font-bold tracking-tight text-gradient">
          Habitator
        </h1>
        <DateNav date={selected} prevDate={prevDate} nextDate={nextDate} today={today} />
      </header>

      {pushupState && <PushupSummary state={pushupState} />}
      {ankiState && <AnkiSummary state={ankiState} />}

      <TodayClient date={selected} initialItems={items} />

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
