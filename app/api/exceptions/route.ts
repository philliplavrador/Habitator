import { NextRequest, NextResponse } from 'next/server';
import {
  clearException,
  isExceptionScope,
  setException,
  type ExceptionScope,
} from '@/lib/exceptions';
import { getHabit } from '@/lib/habits';
import { getCurrentUserId } from '@/lib/auth';
import { parseId, readJson, unauthorized } from '@/lib/apiRoute';
import { compareISO, isValidISODate, todayISO } from '@/lib/dates';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Streak exceptions ("rest days"): mark a specific day for a tracker so a missed
// day doesn't break its streak. One uniform endpoint for every tracker — plain
// habits AND custom habits (rep/plank/anki) — keyed by (scope, ref). See the
// table note in lib/db.ts and the streak-bridging logic in lib/stats/analytics/
// anki. Every row is user_id-scoped, so an unknown ref can at worst create an
// orphan row on the caller's OWN account (unlike entries, whose uniqueness is
// global) — but we still confirm habit ownership so the date-window checks and
// the 404 are meaningful.

interface ExceptionTarget {
  scope: ExceptionScope;
  ref: string;
  date: string;
}

/**
 * Validate the (scope, ref, date) triple against the owner's data. Returns the
 * target on success or an error NextResponse to return as-is. Future dates are
 * always rejected (a rest day can only excuse a day that has passed); for a
 * habit the date must also fall inside its tracked [start_date, end_date] window
 * and the habit must belong to the user.
 */
async function resolveTarget(
  userId: number,
  raw: { scope: unknown; ref: unknown; date: unknown }
): Promise<ExceptionTarget | NextResponse> {
  if (!isExceptionScope(raw.scope)) {
    return NextResponse.json({ error: 'Bad scope.' }, { status: 400 });
  }
  const scope = raw.scope;
  const ref = typeof raw.ref === 'string' ? raw.ref.trim() : '';
  const date = typeof raw.date === 'string' ? raw.date : '';
  if (ref === '') {
    return NextResponse.json({ error: 'Bad ref.' }, { status: 400 });
  }
  if (!isValidISODate(date)) {
    return NextResponse.json({ error: 'Bad date.' }, { status: 400 });
  }
  if (compareISO(date, todayISO(getTimezone())) > 0) {
    return NextResponse.json(
      { error: 'Cannot mark a future date as an exception.' },
      { status: 400 }
    );
  }

  if (scope === 'habit') {
    const habitId = parseId(ref);
    if (habitId === null) {
      return NextResponse.json({ error: 'Bad ref.' }, { status: 400 });
    }
    const habit = await getHabit(userId, habitId);
    if (!habit) {
      return NextResponse.json({ error: 'Habit not found.' }, { status: 404 });
    }
    if (compareISO(date, habit.start_date) < 0) {
      return NextResponse.json(
        { error: 'Date is before the habit start date.' },
        { status: 400 }
      );
    }
    if (habit.end_date !== null && compareISO(date, habit.end_date) > 0) {
      return NextResponse.json(
        { error: 'Date is after the habit end date.' },
        { status: 400 }
      );
    }
    return { scope, ref: String(habitId), date };
  }

  // rep / plank / anki: user-scoped, so trust the ref (a bad one only orphans a
  // row on the caller's own account). The streaks that read it simply ignore
  // dates that don't line up with any real activity.
  return { scope, ref, date };
}

// POST /api/exceptions  body { scope, ref, date }  → mark a rest day
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const target = await resolveTarget(userId, {
    scope: b.scope,
    ref: b.ref,
    date: b.date,
  });
  if (target instanceof NextResponse) return target;

  await setException(userId, target.scope, target.ref, target.date);
  return NextResponse.json({ ok: true });
}

// DELETE /api/exceptions?scope=..&ref=..&date=..  → clear a rest day
export async function DELETE(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const target = await resolveTarget(userId, {
    scope: sp.get('scope'),
    ref: sp.get('ref'),
    date: sp.get('date'),
  });
  if (target instanceof NextResponse) return target;

  const removed = await clearException(
    userId,
    target.scope,
    target.ref,
    target.date
  );
  return NextResponse.json({ ok: true, removed });
}
