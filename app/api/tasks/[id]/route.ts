import { NextRequest, NextResponse } from 'next/server';
import { deleteTask, setTaskDone, updateTask } from '@/lib/tasks';
import { getCurrentUserId } from '@/lib/auth';
import { parseId, readJson, unauthorized } from '@/lib/apiRoute';
import { parseTaskInput } from '@/lib/validate';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'Task not found.' }, { status: 404 });

// PATCH /api/tasks/[id]
//   body { done: boolean }                      → check off / un-check
//   body { title, notes, date, at_time }        → edit the task
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // The done toggle takes precedence when `done` is present — a partial body
  // carrying only this field must not go through parseTaskInput, which requires
  // a whole task. (Same idiom as the `archived` toggle on /api/habits/[id].)
  if (body && typeof body === 'object' && 'done' in (body as Record<string, unknown>)) {
    const done = Boolean((body as Record<string, unknown>).done);
    const task = await setTaskDone(userId, id, done);
    if (!task) return notFound();
    return NextResponse.json({ task });
  }

  const parsed = parseTaskInput(body, getTimezone());
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const task = await updateTask(userId, id, parsed.value);
  if (!task) return notFound();
  return NextResponse.json({ task });
}

// DELETE /api/tasks/[id] → remove the task
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ error: 'Bad id.' }, { status: 400 });

  const removed = await deleteTask(userId, id);
  if (!removed) return notFound();
  return NextResponse.json({ ok: true });
}
