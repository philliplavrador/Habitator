import { pushupProgram } from '@/lib/pushups';
import { createRepItemRoute } from '@/lib/repRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createRepItemRoute(() => pushupProgram);
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
