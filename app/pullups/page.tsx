import RepProgramPage from '@/components/RepProgramPage';
import { getPullupState, listPullupSessions } from '@/lib/pullups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PullupsPage() {
  return (
    <RepProgramPage
      getState={getPullupState}
      listSessions={listPullupSessions}
      title="Pullups"
      subtitle={(state) => (
        <>A {state.programDays}-day progression from 3 × 5 to {state.finishLabel}.</>
      )}
    />
  );
}
