import { createRepSetVideoRoute } from '@/lib/repRoute';
import { resolveUserProgram } from '@/lib/repPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET/PUT/DELETE /api/rep-programs/[id]/[sid]/video/[set] → one set's video
const handlers = createRepSetVideoRoute(
  (userId, params) => resolveUserProgram(userId, params.id),
  'sid'
);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
