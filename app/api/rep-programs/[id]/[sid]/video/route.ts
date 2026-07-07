import { createRepVideoRoute } from '@/lib/repRoute';
import { resolveUserProgram } from '@/lib/repPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET/PUT/DELETE /api/rep-programs/[id]/[sid]/video → the whole-workout video
const handlers = createRepVideoRoute(
  (userId, params) => resolveUserProgram(userId, params.id),
  'sid'
);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
