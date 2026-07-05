import { NextRequest, NextResponse } from 'next/server';
import { ANKI, getAnkiState, listAnkiDays, setAnkiDay } from '@/lib/anki';
import { parseAnkiDayInput } from '@/lib/validate';
import { compareISO, todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/anki → the computed tracker state plus the full day log.
export async function GET() {
  const tz = getTimezone();
  return NextResponse.json({ state: getAnkiState(tz), days: listAnkiDays() });
}

// POST /api/anki  body { date?, new_cards } → upsert one day's new-card count
// (one row per date; date defaults to today). Returns the day + fresh state.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const tz = getTimezone();
  const parsed = parseAnkiDayInput(body, tz);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // Keep the persisted range consistent with the UI: no pre-start or future
  // days (they'd skew totals/pace while daysElapsed ignores them).
  const { date } = parsed.value;
  if (compareISO(date, ANKI.startDate) < 0 || compareISO(date, todayISO(tz)) > 0) {
    return NextResponse.json(
      { error: `date must be between ${ANKI.startDate} and today.` },
      { status: 400 }
    );
  }

  const day = setAnkiDay(parsed.value);
  return NextResponse.json({ day, state: getAnkiState(tz) }, { status: 201 });
}
