import { notFound } from 'next/navigation';
import PlankProgramPage from '@/components/PlankProgramPage';
import PlankProgramActions from '@/components/PlankProgramActions';
import { requirePageContext } from '@/lib/pageContext';
import { getPlankProgram, programFromRow } from '@/lib/plankPrograms';
import { formatHold } from '@/lib/plankFormat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The screen for a user-defined plank program: the logging card, past recordings,
// stats, heatmap, charts, and history — bound to the program resolved from [id].
export default async function UserPlankProgramPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId } = await requirePageContext();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const row = await getPlankProgram(userId, id);
  if (!row) notFound();

  const program = programFromRow(row);

  return (
    <PlankProgramPage
      getState={(uid, tz) => program.getState(uid, tz)}
      listSessions={(uid) => program.list(uid)}
      title={row.name}
      subtitle={(state) => (
        <>
          A {state.programDays}-day progression from{' '}
          {formatHold(state.startSeconds)} to {state.finishLabel}.
        </>
      )}
      actions={<PlankProgramActions id={row.id} name={row.name} />}
    />
  );
}
