import { pushupProgram } from '@/lib/pushups';
import { createRepSetVideoRoute } from '@/lib/repRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createRepSetVideoRoute(() => pushupProgram);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
