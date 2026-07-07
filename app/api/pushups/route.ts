import { pushupProgram } from '@/lib/pushups';
import { createRepCollectionRoute } from '@/lib/repRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createRepCollectionRoute(() => pushupProgram);
export const GET = handlers.GET;
export const POST = handlers.POST;
