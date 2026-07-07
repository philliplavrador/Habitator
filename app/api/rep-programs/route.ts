import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { parseRepProgramInput } from '@/lib/validate';
import { addRepProgram, listRepPrograms } from '@/lib/repPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET  /api/rep-programs                → the user's rep-program configs
// POST /api/rep-programs { name, ... }  → create a new rep program
export async function GET() {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  return NextResponse.json({ programs: await listRepPrograms(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = parseRepProgramInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const program = await addRepProgram(userId, parsed.value);
  return NextResponse.json({ program }, { status: 201 });
}
