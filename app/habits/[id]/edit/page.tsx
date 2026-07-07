import BackHeader from '@/components/BackHeader';
import AddHabitForm from '@/components/AddHabitForm';
import { loadHabitOr404 } from '@/lib/habitPage';
import { requirePageContext } from '@/lib/pageContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditHabitPage({
  params,
}: {
  params: { id: string };
}) {
  const { userId, tz } = await requirePageContext();
  const habit = await loadHabitOr404(params.id, userId);

  return (
    <main className="py-4">
      <BackHeader href={`/habits/${habit.id}`} title="Edit habit" />

      <AddHabitForm habit={habit} tz={tz} />
    </main>
  );
}
