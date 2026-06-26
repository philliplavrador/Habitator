import { NextRequest, NextResponse } from 'next/server';
import { clearEntry, setEntry } from '@/lib/entries';
import { getHabit } from '@/lib/habits';
import { compareISO, isValidISODate, todayISO } from '@/lib/dates';
import type { EntryStatus } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseHabitId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// POST /api/entries  body { habitId, date, status }  → set pass/fail
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const habitId = parseHabitId(b.habitId);
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

  const habit = getHabit(habitId);
  if (!habit) {
    return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
  }
  // Enforce the "no future days" invariant (the UI also blocks it). A future
  // entry would otherwise skew stats — e.g. falsely extend the current streak.
  if (compareISO(date, todayISO()) > 0) {
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

  const entry = setEntry(habitId, date, status);
  return NextResponse.json({ entry });
}

// DELETE /api/entries?habitId=..&date=..  → clear back to blank
export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const habitId = parseHabitId(sp.get('habitId'));
  const date = sp.get('date') ?? '';

  if (habitId === null) {
    return NextResponse.json({ error: 'Bad habitId.' }, { status: 400 });
  }
  if (!isValidISODate(date)) {
    return NextResponse.json({ error: 'Bad date.' }, { status: 400 });
  }

  const removed = clearEntry(habitId, date);
  return NextResponse.json({ ok: true, removed });
}
