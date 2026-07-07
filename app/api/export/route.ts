import { NextResponse } from 'next/server';
import { many } from '@/lib/db';
import { getCurrentUserId } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/export → full JSON backup of the logged-in user's habits + entries +
// fasts + pushups + pullups + anki. Surfaced as the "Export data" link in the
// footer so the owner can always pull a backup regardless of infra. (Uploaded
// video files live on the volume, not in this JSON — they're referenced by the
// `video` filename column.)
export async function GET() {
  const userId = await getCurrentUserId();
  if (userId === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [habits, entries, fasts, pushupSessions, pullupSessions, ankiDays] =
    await Promise.all([
      many('SELECT * FROM habits WHERE user_id = $1 ORDER BY id ASC', [userId]),
      many(
        'SELECT * FROM entries WHERE user_id = $1 ORDER BY habit_id ASC, date ASC',
        [userId]
      ),
      many('SELECT * FROM fasts WHERE user_id = $1 ORDER BY start_at ASC, id ASC', [
        userId,
      ]),
      many('SELECT * FROM pushup_sessions WHERE user_id = $1 ORDER BY id ASC', [
        userId,
      ]),
      many('SELECT * FROM pullup_sessions WHERE user_id = $1 ORDER BY id ASC', [
        userId,
      ]),
      many('SELECT * FROM anki_days WHERE user_id = $1 ORDER BY date ASC', [
        userId,
      ]),
    ]);

  const payload = {
    app: 'habitator',
    version: 6,
    exportedAt: new Date().toISOString(),
    habits,
    entries,
    fasts,
    pushupSessions,
    pullupSessions,
    ankiDays,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="habitator-backup.json"',
    },
  });
}
