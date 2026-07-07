import { notFound } from 'next/navigation';
import RepProgramPage from '@/components/RepProgramPage';
import RepProgramActions from '@/components/RepProgramActions';
import { requirePageContext } from '@/lib/pageContext';
import { getRepProgram, programFromRow } from '@/lib/repPrograms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The screen for a user-defined rep program. Reuses the exact pushups/pullups
// shell (RepProgramPage) — logging card, stats, heatmap, charts, history — by
// binding it to the program instance resolved from the [id] segment.
export default async function UserRepProgramPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId } = await requirePageContext();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const row = await getRepProgram(userId, id);
  if (!row) notFound();

  const program = programFromRow(row);

  return (
    <RepProgramPage
      getState={(uid, tz) => program.getState(uid, tz)}
      listSessions={(uid) => program.list(uid)}
      title={row.name}
      subtitle={(state) => (
        <>
          A {state.programDays}-day progression to {state.finishLabel}.
        </>
      )}
      actions={
        <RepProgramActions
          id={row.id}
          name={row.name}
          restSeconds={row.rest_seconds}
        />
      }
    />
  );
}
