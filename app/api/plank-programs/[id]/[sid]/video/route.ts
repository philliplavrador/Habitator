import { createPlankVideoRoute } from '@/lib/plankRoute';
import { resolveUserPlankProgram } from '@/lib/plankPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET/PUT/DELETE /api/plank-programs/[id]/[sid]/video → the session's video
const handlers = createPlankVideoRoute(
  (userId, params) => resolveUserPlankProgram(userId, params.id),
  'sid'
);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
