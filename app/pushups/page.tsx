import PushupCard from '@/components/PushupCard';
import { getPushupState } from '@/lib/pushups';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function PushupsPage() {
  const tz = getTimezone();
  const state = getPushupState(tz);

  return (
    <main className="pb-28 pt-4">
      <header className="mb-5">
        <h1 className="text-center font-display text-xl font-bold tracking-tight text-text-primary">
          Pushups
        </h1>
        <p className="mt-1 text-center text-xs text-text-muted">
          A {state.programDays}-day progression to 3 × 50.
        </p>
      </header>

      <PushupCard initialState={state} />
    </main>
  );
}
