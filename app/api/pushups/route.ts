import { NextRequest, NextResponse } from 'next/server';
import { getPushupState, logPushupSession } from '@/lib/pushups';
import { parsePushupReps } from '@/lib/validate';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/pushups → the computed program state.
export async function GET() {
  return NextResponse.json({ state: getPushupState(getTimezone()) });
}

// POST /api/pushups  body { reps: [r1, r2, r3] } → log an attempt at the
// current day; advances only if every set met its target.
export async function POST(req: NextRequest) {
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

  const state = logPushupSession(parsed.value, getTimezone());
  return NextResponse.json({ state }, { status: 201 });
}
