import { createPlankItemRoute } from '@/lib/plankRoute';
import { resolveUserPlankProgram } from '@/lib/plankPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH  /api/plank-programs/[id]/[sid]  { lasted } → edit a session's hold
// DELETE /api/plank-programs/[id]/[sid]             → remove a session (+ video)
const handlers = createPlankItemRoute(
  (userId, params) => resolveUserPlankProgram(userId, params.id),
  'sid'
);
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
