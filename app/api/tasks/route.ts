import { NextRequest, NextResponse } from 'next/server';
import { createTask, listTasksForDate, rollOverTasks } from '@/lib/tasks';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { parseTaskInput } from '@/lib/validate';
import { getTimezone } from '@/lib/tz';
import { isValidISODate, todayISO } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/tasks?date=YYYY-MM-DD → that day's tasks (defaults to today).
// Reads roll unfinished past tasks onto today first — carry-over is lazy, so
// every entry point into the tasks data does the sweep (see lib/tasks.ts).
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const today = todayISO(getTimezone());
  const raw = req.nextUrl.searchParams.get('date');
  if (raw !== null && !isValidISODate(raw)) {
    return NextResponse.json({ error: 'Bad date.' }, { status: 400 });
  }

  await rollOverTasks(userId, today);
  const tasks = await listTasksForDate(userId, raw ?? today);
  return NextResponse.json({ tasks });
}

// POST /api/tasks → create a task
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseTaskInput(body, getTimezone());
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const task = await createTask(userId, parsed.value);
  return NextResponse.json({ task }, { status: 201 });
}
