import { NextRequest, NextResponse } from 'next/server';
import { ActiveFastError, deleteFast, getFast, updateFast } from '@/lib/fasts';
import { getCurrentUserId } from '@/lib/auth';
import { parseUpdateFastInput } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PATCH /api/fasts/[id]
//   body { end_at }                         → end the fast
//   body { start_at?, end_at?, goal_hours?, note? } → edit fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseUpdateFastInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const existing = await getFast(userId, id);
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Cross-field check against the merged row: a completed fast must not end
  // before it starts. (`end_at: null` re-opens the fast, which is always fine.)
  const nextStart = parsed.value.start_at ?? existing.start_at;
  const nextEnd =
    parsed.value.end_at !== undefined ? parsed.value.end_at : existing.end_at;
  if (
    typeof nextEnd === 'string' &&
    Date.parse(nextEnd) < Date.parse(nextStart)
  ) {
    return NextResponse.json(
      { error: 'A fast cannot end before it starts.' },
      { status: 400 }
    );
  }

  try {
    const fast = await updateFast(userId, id, parsed.value);
    if (!fast) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ fast });
  } catch (err) {
    if (err instanceof ActiveFastError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

// DELETE /api/fasts/[id] → remove a fast.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });

  const removed = await deleteFast(userId, id);
  if (!removed) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
