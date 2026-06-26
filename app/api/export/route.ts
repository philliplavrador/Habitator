import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Entry, Habit } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/export → full JSON backup of habits + entries.
// Surfaced as the "Export data" link in the footer so the owner can always
// pull a backup regardless of infra.
export async function GET() {
  const habits = db
    .prepare('SELECT * FROM habits ORDER BY id ASC')
    .all() as Habit[];
  const entries = db
    .prepare('SELECT * FROM entries ORDER BY habit_id ASC, date ASC')
    .all() as Entry[];

  const payload = {
    app: 'habitator',
    version: 1,
    exportedAt: new Date().toISOString(),
    habits,
    entries,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="habitator-backup.json"',
    },
  });
}
