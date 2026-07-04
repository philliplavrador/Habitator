import NavTabs from '@/components/NavTabs';
import FastClient from '@/components/FastClient';
import FastHistory from '@/components/FastHistory';
import Footer from '@/components/Footer';
import { getActiveFast, listFasts } from '@/lib/fasts';
import { computeFastStats } from '@/lib/fastStats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function FastsPage() {
  const active = getActiveFast() ?? null;
  const fasts = listFasts();
  const stats = computeFastStats(fasts);

  return (
    <main className="pb-16 pt-4">
      <header className="mb-5">
        <h1 className="mb-4 text-center text-lg font-bold tracking-tight text-text-primary">
          Habitator
        </h1>
        <NavTabs />
      </header>

      <FastClient active={active} />

      <FastHistory fasts={fasts} stats={stats} />

      <Footer />
    </main>
  );
}
