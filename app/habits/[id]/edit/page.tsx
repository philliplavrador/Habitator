import Link from 'next/link';
import { notFound } from 'next/navigation';
import AddHabitForm from '@/components/AddHabitForm';
import { getHabit } from '@/lib/habits';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function EditHabitPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const habit = getHabit(id);
  if (!habit) notFound();

  return (
    <main className="py-4">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href={`/habits/${id}`}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-btn border border-border text-text-secondary active:bg-surface2"
        >
          ‹
        </Link>
        <h1 className="text-lg font-bold text-text-primary">Edit habit</h1>
      </header>

      <AddHabitForm habit={habit} tz={getTimezone()} />
    </main>
  );
}
