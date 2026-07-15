import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { parsePlankProgramInput } from '@/lib/validate';
import { addPlankProgram, listPlankPrograms } from '@/lib/plankPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET  /api/plank-programs                → the user's plank-program configs
// POST /api/plank-programs { name, ... }  → create a new plank program
export async function GET() {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  return NextResponse.json({ programs: await listPlankPrograms(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = parsePlankProgramInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const program = await addPlankProgram(userId, parsed.value);
  return NextResponse.json({ program }, { status: 201 });
}
