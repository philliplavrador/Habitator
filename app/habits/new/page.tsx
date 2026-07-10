import BackHeader from '@/components/BackHeader';
import NewHabitFlow from '@/components/NewHabitFlow';
import { CUSTOM_HABIT_LIBRARY, listUserDomains } from '@/lib/domains';
import { requirePageContext } from '@/lib/pageContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewHabitPage() {
  const { userId, tz } = await requirePageContext();
  // The one-per-account library habits this user already has, so the picker can
  // show them as "Added" rather than letting them add a second copy.
  const added = (await listUserDomains(userId)).map((d) => d.domain);

  return (
    <main className="py-4">
      <BackHeader href="/" title="New habit" />

      <NewHabitFlow tz={tz} library={CUSTOM_HABIT_LIBRARY} added={added} />
    </main>
  );
}
