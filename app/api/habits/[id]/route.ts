import { NextRequest, NextResponse } from 'next/server';
import {
  deleteHabit,
  getHabit,
  setHabitArchived,
  updateHabit,
} from '@/lib/habits';
import { getHabitStats } from '@/lib/stats';
import { parseHabitInput } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/habits/[id] → habit + stats
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });

  const habit = getHabit(id);
  if (!habit) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return NextResponse.json({ habit, stats: getHabitStats(id) });
}

// PATCH /api/habits/[id]
//   body { name, details, exceptions, start_date }  → edit fields
//   body { archived: boolean }                      → archive/unarchive
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // Archive toggle takes precedence when `archived` is present.
  if (
    body &&
    typeof body === 'object' &&
    'archived' in (body as Record<string, unknown>)
  ) {
    const archived = Boolean((body as Record<string, unknown>).archived);
    const habit = setHabitArchived(id, archived);
    if (!habit) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ habit });
  }

  const parsed = parseHabitInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const habit = updateHabit(id, parsed.value);
  if (!habit) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ habit });
}

// DELETE /api/habits/[id] → remove habit + its entries (cascade)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });

  const removed = deleteHabit(id);
  if (!removed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
