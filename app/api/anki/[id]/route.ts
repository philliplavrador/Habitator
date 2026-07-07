import { NextRequest, NextResponse } from 'next/server';
import { deleteAnkiDay, getAnkiState, updateAnkiDay } from '@/lib/anki';
import { getCurrentUserId } from '@/lib/auth';
import { parseNewCardsField } from '@/lib/validate';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// PATCH /api/anki/[id]  body { new_cards } → edit a logged day's count.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = parseId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Bad day id.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseNewCardsField(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const day = await updateAnkiDay(userId, id, parsed.value);
  if (!day) {
    return NextResponse.json({ error: 'Day not found.' }, { status: 404 });
  }
  return NextResponse.json({
    day,
    state: await getAnkiState(userId, getTimezone()),
  });
}

// DELETE /api/anki/[id] → remove a logged day.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = parseId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Bad day id.' }, { status: 400 });
  }

  const removed = await deleteAnkiDay(userId, id);
  if (!removed) {
    return NextResponse.json({ error: 'Day not found.' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    state: await getAnkiState(userId, getTimezone()),
  });
}
