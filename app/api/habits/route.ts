import { NextRequest, NextResponse } from 'next/server';
import { createHabit, listActiveHabits, listAllHabits } from '@/lib/habits';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { parseHabitInput } from '@/lib/validate';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/habits           → active habits
// GET /api/habits?all=1     → every habit (incl. archived)
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const all = req.nextUrl.searchParams.get('all');
  const habits = all ? await listAllHabits(userId) : await listActiveHabits(userId);
  return NextResponse.json({ habits });
}

// POST /api/habits → create a habit
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseHabitInput(body, getTimezone());
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const habit = await createHabit(userId, parsed.value);
  return NextResponse.json({ habit }, { status: 201 });
}
