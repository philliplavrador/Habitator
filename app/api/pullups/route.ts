import { pullupProgram } from '@/lib/pullups';
import { createRepCollectionRoute } from '@/lib/repRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createRepCollectionRoute(() => pullupProgram);
export const GET = handlers.GET;
export const POST = handlers.POST;
