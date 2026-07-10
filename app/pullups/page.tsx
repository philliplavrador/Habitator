import { redirect } from 'next/navigation';
import RepProgramPage from '@/components/RepProgramPage';
import { hasUserDomain } from '@/lib/domains';
import { requirePageContext } from '@/lib/pageContext';
import { getPullupState, listPullupSessions } from '@/lib/pullups';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PullupsPage() {
  // An opt-in custom habit: no habit (never added, or deleted), no screen.
  const { userId } = await requirePageContext();
  if (!(await hasUserDomain(userId, 'pullups'))) redirect('/');

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
