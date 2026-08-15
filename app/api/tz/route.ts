import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { isValidTimeZone } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Persist the owner's IANA timezone on their user row.
 *
 * Everything the owner triggers reads the zone from the `tz` cookie
 * (lib/tz.ts), which is enough for requests they make themselves. The reminder
 * sender is the exception: it runs from a cron with no cookie, so it needs the
 * zone in the database to know when "08:00 local" is for each user. TimezoneSync
 * posts here once per browser session, which keeps the column fresh (including
 * after travel) without a write on every page render.
 */
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const tz = (body as { tz?: unknown })?.tz;
  if (!isValidTimeZone(tz)) {
    return NextResponse.json({ error: 'Bad timezone.' }, { status: 400 });
  }

  // Only write when it actually changed — the common case is a no-op.
  await run(
    `UPDATE users SET tz = $1 WHERE id = $2 AND (tz IS NULL OR tz <> $1)`,
    [tz, userId]
  );
  return NextResponse.json({ ok: true });
}
