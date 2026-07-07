import { createRepItemRoute } from '@/lib/repRoute';
import { resolveUserProgram } from '@/lib/repPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH  /api/rep-programs/[id]/[sid]  { reps } → edit a session's reps
// DELETE /api/rep-programs/[id]/[sid]           → remove a session (+ videos)
const handlers = createRepItemRoute(
  (userId, params) => resolveUserProgram(userId, params.id),
  'sid'
);
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
