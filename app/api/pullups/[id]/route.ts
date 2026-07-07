import { pullupProgram } from '@/lib/pullups';
import { createRepItemRoute } from '@/lib/repRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createRepItemRoute(pullupProgram);
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
