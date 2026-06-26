import { NextRequest, NextResponse } from 'next/server';
import { createHabit, listActiveHabits, listAllHabits } from '@/lib/habits';
import { parseHabitInput } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/habits           → active habits
// GET /api/habits?all=1     → every habit (incl. archived)
export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all');
  const habits = all ? listAllHabits() : listActiveHabits();
  return NextResponse.json({ habits });
}

// POST /api/habits → create a habit
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseHabitInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const habit = createHabit(parsed.value);
  return NextResponse.json({ habit }, { status: 201 });
}
