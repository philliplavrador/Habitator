import { requirePageContext } from '@/lib/pageContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PingPage() {
  await requirePageContext();

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary">
        pong
      </h1>
    </main>
  );
}
