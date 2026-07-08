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

  const [
    habits,
    entries,
    fasts,
    pushupSessions,
    pullupSessions,
    repPrograms,
    repProgramSessions,
    ankiDays,
  ] = await Promise.all([
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
    many('SELECT * FROM rep_programs WHERE user_id = $1 ORDER BY id ASC', [
      userId,
    ]),
    many(
      'SELECT * FROM rep_program_sessions WHERE user_id = $1 ORDER BY program_id ASC, id ASC',
      [userId]
    ),
    many('SELECT * FROM anki_days WHERE user_id = $1 ORDER BY date ASC', [
      userId,
    ]),
  ]);

  // Backup envelope. `version` and the table list below are coupled to the DB
  // schema (lib/db.ts): each `version` pins the exact set of tables/columns a
  // dump contains. Adding a new tracked domain (a new table exported here) OR a
  // new column on an exported table is a format change — bump `version`, add its
  // SELECT to the Promise.all above (SELECT * already picks up new columns), and
  // add the field to this payload together, so an importer can tell what a given
  // dump holds. (version 6 = habits, entries, fasts, pushupSessions,
  // pullupSessions, ankiDays. version 7 added *_sessions.videos — the per-set
  // video array. version 8 added habits.kind — 'build' | 'quit'. version 9
  // added habits.schedule — JSON-in-TEXT, NULL means daily. version 10 added the
  // user-defined rep programs: repPrograms + repProgramSessions. version 11 added
  // habits.end_date — optional YYYY-MM-DD upper bound, NULL means ongoing.)
  const payload = {
    app: 'habitator',
    version: 11,
    exportedAt: new Date().toISOString(),
    habits,
    entries,
    fasts,
    pushupSessions,
    pullupSessions,
    repPrograms,
    repProgramSessions,
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
