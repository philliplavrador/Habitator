import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { parsePlankProgramEdit } from '@/lib/validate';
import { createPlankCollectionRoute } from '@/lib/plankRoute';
import {
  editPlankProgram,
  removePlankProgram,
  resolveUserPlankProgram,
} from '@/lib/plankPrograms';
import { deleteVideoFile } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET  /api/plank-programs/[id]              → program state (collection GET)
// POST /api/plank-programs/[id]  { lasted }  → log a hold (collection POST)
const collection = createPlankCollectionRoute((userId, params) =>
  resolveUserPlankProgram(userId, params.id)
);
export const GET = collection.GET;
export const POST = collection.POST;

function parseProgramId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// PATCH /api/plank-programs/[id]  { name } → edit the program name (ramp frozen)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const id = parseProgramId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });
  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const parsed = parsePlankProgramEdit(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const program = await editPlankProgram(userId, id, parsed.value);
  if (!program) {
    return NextResponse.json({ error: 'Program not found.' }, { status: 404 });
  }
  return NextResponse.json({ program });
}

// DELETE /api/plank-programs/[id] → delete the program (+ its sessions & videos)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const program = await resolveUserPlankProgram(userId, params.id);
  if (!program || program.config.programId == null) {
    return NextResponse.json({ error: 'Program not found.' }, { status: 404 });
  }
  // Collect every video file BEFORE the cascade delete drops the session rows,
  // so we can unlink the orphaned files afterward (the DB rows go via the FK).
  const sessions = await program.list(userId);
  const files = sessions
    .map((s) => s.video)
    .filter((v): v is string => typeof v === 'string');

  const removed = await removePlankProgram(userId, program.config.programId);
  if (!removed) {
    return NextResponse.json({ error: 'Program not found.' }, { status: 404 });
  }
  for (const f of files) deleteVideoFile(f);
  return NextResponse.json({ ok: true });
}
