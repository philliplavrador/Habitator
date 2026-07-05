import { NextRequest, NextResponse } from 'next/server';
import {
  deletePushupSession,
  getPushupSession,
  getPushupState,
  updatePushupSession,
} from '@/lib/pushups';
import { parsePushupReps } from '@/lib/validate';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// PATCH /api/pushups/[id]  body { reps: [r1, r2, r3] }
// Updates a session's reps; `completed` is recomputed from the stored target.
// Returns the updated session plus the fresh program state (day may shift).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Bad session id.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parsePushupReps(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const session = updatePushupSession(id, parsed.value);
  if (!session) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }
  return NextResponse.json({ session, state: getPushupState(getTimezone()) });
}

// DELETE /api/pushups/[id] → remove a session (may roll the current day back).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Bad session id.' }, { status: 400 });
  }

  const removed = deletePushupSession(id);
  if (!removed) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, state: getPushupState(getTimezone()) });
}
