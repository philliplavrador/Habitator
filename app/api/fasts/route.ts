import { NextRequest, NextResponse } from 'next/server';
import { ActiveFastError, createFast, getActiveFast, listFasts } from '@/lib/fasts';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { computeFastStats } from '@/lib/fastStats';
import { parseStartFastInput } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/fasts → active fast (or null), full list, and summary stats.
export async function GET() {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const fasts = await listFasts(userId);
  return NextResponse.json({
    active: (await getActiveFast(userId)) ?? null,
    fasts,
    stats: computeFastStats(fasts),
  });
}

// POST /api/fasts
//   body { start_at?, goal_hours }          → start a live fast (409 if one is
//                                             already in progress)
//   body { start_at, end_at }               → log an already-completed fast
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseStartFastInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const fast = await createFast(userId, parsed.value);
    return NextResponse.json({ fast }, { status: 201 });
  } catch (err) {
    if (err instanceof ActiveFastError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
