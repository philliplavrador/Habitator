import { redirect } from 'next/navigation';
import RepProgramPage from '@/components/RepProgramPage';
import { hasUserDomain } from '@/lib/domains';
import { requirePageContext } from '@/lib/pageContext';
import { getPushupState, listPushupSessions } from '@/lib/pushups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PushupsPage() {
  // An opt-in custom habit: no habit (never added, or deleted), no screen.
  const { userId } = await requirePageContext();
  if (!(await hasUserDomain(userId, 'pushups'))) redirect('/');

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
