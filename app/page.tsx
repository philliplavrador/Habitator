import Link from 'next/link';
import NavTabs from '@/components/NavTabs';
import DateNav from '@/components/DateNav';
import TodayClient from '@/components/TodayClient';
import PushupCard from '@/components/PushupCard';
import Footer from '@/components/Footer';
import { listActiveHabits } from '@/lib/habits';
import { statusMapForDate } from '@/lib/entries';
import { getCurrentStreak } from '@/lib/stats';
import { getPushupState } from '@/lib/pushups';
import {
  addDays,
  compareISO,
  isValidISODate,
  todayISO,
} from '@/lib/dates';
import type { HabitDayView } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function TodayPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const today = todayISO();

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
  const pushupState = isToday ? getPushupState() : null;

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="mb-4 text-center text-lg font-bold tracking-tight text-text-primary">
          Habitator
        </h1>
        <NavTabs />
        <DateNav date={selected} prevDate={prevDate} nextDate={nextDate} />
      </header>

      {pushupState && <PushupCard initialState={pushupState} />}

      <TodayClient date={selected} initialItems={items} />

      <Footer />

      {/* Fixed bottom Add bar — adding a habit is always one tap away. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-6">
        <div className="mx-auto max-w-md px-4 pb-4">
          <Link
            href="/habits/new"
            className="block rounded-btn bg-accent px-4 py-3.5 text-center text-base font-semibold text-white shadow-lg shadow-black/30 active:bg-accent-soft"
          >
            ＋ Add habit
          </Link>
        </div>
      </div>
    </main>
  );
}
