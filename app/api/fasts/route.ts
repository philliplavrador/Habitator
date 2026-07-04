import { NextRequest, NextResponse } from 'next/server';
import { ActiveFastError, getActiveFast, listFasts, startFast } from '@/lib/fasts';
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

// POST /api/fasts  body { goal_hours, start_at?, note? } → start a fast.
// 409 if a fast is already in progress.
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
    const fast = startFast(parsed.value);
    return NextResponse.json({ fast }, { status: 201 });
  } catch (err) {
    if (err instanceof ActiveFastError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
