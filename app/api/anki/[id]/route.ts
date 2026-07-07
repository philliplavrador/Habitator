import { NextRequest, NextResponse } from 'next/server';
import { deleteAnkiDay, getAnkiState, updateAnkiDay } from '@/lib/anki';
import { getCurrentUserId } from '@/lib/auth';
import { parseId, readJson, unauthorized } from '@/lib/apiRoute';
import { parseNewCardsField } from '@/lib/validate';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/anki/[id]  body { new_cards } → edit a logged day's count.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const id = parseId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
  }

  const body = await readJson(req);
  if (body === undefined) {
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
  if (userId === null) return unauthorized();
  const id = parseId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
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
