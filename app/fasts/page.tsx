import FastClient from '@/components/FastClient';
import FastHistory from '@/components/FastHistory';
import Footer from '@/components/Footer';
import { getActiveFast, listFasts } from '@/lib/fasts';
import { computeFastStats } from '@/lib/fastStats';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function FastsPage() {
  const tz = getTimezone();
  const active = getActiveFast() ?? null;
  const fasts = listFasts();
  const stats = computeFastStats(fasts);

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="text-center font-display text-xl font-bold tracking-tight text-text-primary">
          Fasting
        </h1>
      </header>

      <FastClient active={active} tz={tz} />

      <FastHistory fasts={fasts} stats={stats} tz={tz} />

      <Footer />
    </main>
  );
}
