import RepProgramPage from '@/components/RepProgramPage';
import { getPushupState, listPushupSessions } from '@/lib/pushups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PushupsPage() {
  return (
    <RepProgramPage
      getState={getPushupState}
      listSessions={listPushupSessions}
      title="Pushups"
      subtitle={(state) => (
        <>A {state.programDays}-day progression to {state.finishLabel}.</>
      )}
    />
  );
}
