import { NextRequest, NextResponse } from 'next/server';
import { ActiveFastError, createFast, getActiveFast, listFasts } from '@/lib/fasts';
import { computeFastStats } from '@/lib/fastStats';
import { parseStartFastInput } from '@/lib/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/fasts → active fast (or null), full list, and summary stats.
export async function GET() {
  const fasts = listFasts();
  return NextResponse.json({
    active: getActiveFast() ?? null,
    fasts,
    stats: computeFastStats(fasts),
  });
}

// POST /api/fasts
//   body { start_at?, goal_hours }          → start a live fast (409 if one is
//                                             already in progress)
//   body { start_at, end_at }               → log an already-completed fast
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const parsed = parseStartFastInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const fast = createFast(parsed.value);
    return NextResponse.json({ fast }, { status: 201 });
  } catch (err) {
    if (err instanceof ActiveFastError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
