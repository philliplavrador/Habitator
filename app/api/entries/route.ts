import { NextRequest, NextResponse } from 'next/server';
import { clearEntry, listEntriesForHabitSince, setEntry } from '@/lib/entries';
import { getHabit } from '@/lib/habits';
import { getCurrentUserId } from '@/lib/auth';
import { parseId, readJson, unauthorized } from '@/lib/apiRoute';
import { compareISO, isValidISODate, todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';
import { computeHabitStats } from '@/lib/stats';
import { weekStartOf } from '@/lib/schedule';
import type { EntryStatus, Habit, WeeklyProgress } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Fresh { currentStreak, weekly } for one habit, so the client can merge it into
 * local state instead of a full `router.refresh()` after a check-off. Mirrors
 * app/page.tsx exactly: the streak is computed against the owner-tz `today`
 * (NOT the edited day), and `weekly` counts `pass` entries in the week
 * containing the edited `date`.
 */
async function habitFreshState(
  userId: number,
  habit: Habit,
  date: string,
  today: string
): Promise<{ currentStreak: number; weekly?: WeeklyProgress }> {
  const entries = await listEntriesForHabitSince(userId, habit.id, habit.start_date);
  const currentStreak = computeHabitStats(habit, entries, today).currentStreak;
  let weekly: WeeklyProgress | undefined;
  if (habit.schedule.kind === 'weekly') {
    const wkStart = weekStartOf(date);
    const done = entries.filter(
      (e) => e.status === 'pass' && e.date >= wkStart && e.date <= date
    ).length;
    weekly = { done, target: habit.schedule.count };
  }
  return { currentStreak, weekly };
}

// POST /api/entries  body { habitId, date, status }  → set pass/fail
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const habitId = parseId(b.habitId);
  const date = typeof b.date === 'string' ? b.date : '';
  const status = b.status as EntryStatus;

  if (habitId === null) {
    return NextResponse.json({ error: 'Bad habitId.' }, { status: 400 });
  }
  if (!isValidISODate(date)) {
    return NextResponse.json({ error: 'Bad date.' }, { status: 400 });
  }
  if (status !== 'pass' && status !== 'fail') {
    return NextResponse.json({ error: 'status must be pass or fail.' }, { status: 400 });
  }

  // Confirm the habit belongs to this user before writing an entry for it —
  // the (habit_id, date) uniqueness is global, so an unchecked habitId could
  // clobber another account's data.
  const habit = await getHabit(userId, habitId);
  if (!habit) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  // Enforce the "no future days" invariant (the UI also blocks it). A future
  // entry would otherwise skew stats — e.g. falsely extend the current streak.
  if (compareISO(date, todayISO(getTimezone())) > 0) {
    return NextResponse.json(
      { error: 'Cannot record an entry for a future date.' },
      { status: 400 }
    );
  }
  // Entries before the start date are never counted by stats, so reject them
  // rather than create a hidden orphan row.
  if (compareISO(date, habit.start_date) < 0) {
    return NextResponse.json(
      { error: 'Date is before the habit start date.' },
      { status: 400 }
    );
  }
  // Likewise, entries after the habit's end date fall outside its tracked
  // window (stats freeze at end_date), so reject them.
  if (habit.end_date !== null && compareISO(date, habit.end_date) > 0) {
    return NextResponse.json(
      { error: 'Date is after the habit end date.' },
      { status: 400 }
    );
  }

  const entry = await setEntry(userId, habitId, date, status);
  // Return the habit's fresh streak/weekly so the client can merge it in place
  // of a full `router.refresh()` RSC refetch. Same computation as app/page.tsx.
  const { currentStreak, weekly } = await habitFreshState(
    userId,
    habit,
    date,
    todayISO(getTimezone())
  );
  return NextResponse.json({ entry, currentStreak, weekly });
}

// DELETE /api/entries?habitId=..&date=..  → clear back to blank
export async function DELETE(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const habitId = parseId(sp.get('habitId'));
  const date = sp.get('date') ?? '';

  if (habitId === null) {
    return NextResponse.json({ error: 'Bad habitId.' }, { status: 400 });
  }
  if (!isValidISODate(date)) {
    return NextResponse.json({ error: 'Bad date.' }, { status: 400 });
  }

  const removed = await clearEntry(userId, habitId, date);
  // Return the affected habit's fresh streak/weekly (same as POST) so the client
  // merges rather than `router.refresh()`. The habit is loaded user-scoped; if
  // it's gone (or not this user's), keep the original { ok, removed } contract.
  const habit = await getHabit(userId, habitId);
  if (!habit) {
    return NextResponse.json({ ok: true, removed });
  }
  const { currentStreak, weekly } = await habitFreshState(
    userId,
    habit,
    date,
    todayISO(getTimezone())
  );
  return NextResponse.json({ ok: true, removed, currentStreak, weekly });
}
