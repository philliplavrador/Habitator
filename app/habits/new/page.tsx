import Link from 'next/link';
import AddHabitForm from '@/components/AddHabitForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function NewHabitPage() {
  return (
    <main className="py-4">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-btn border border-border text-text-secondary active:bg-surface2"
        >
          ‹
        </Link>
        <h1 className="text-lg font-bold text-text-primary">New habit</h1>
      </header>

      <AddHabitForm />
    </main>
  );
}
