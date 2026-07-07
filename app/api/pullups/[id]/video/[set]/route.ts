import { pullupProgram } from '@/lib/pullups';
import { createRepSetVideoRoute } from '@/lib/repRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createRepSetVideoRoute(pullupProgram);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
