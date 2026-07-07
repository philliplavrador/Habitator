import BackHeader from '@/components/BackHeader';
import NewHabitFlow from '@/components/NewHabitFlow';
import { requirePageContext } from '@/lib/pageContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewHabitPage() {
  const { tz } = await requirePageContext();

  return (
    <main className="py-4">
      <BackHeader href="/" title="New habit" />

      <NewHabitFlow tz={tz} />
    </main>
  );
}
