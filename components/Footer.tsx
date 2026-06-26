'use client';

import { useRouter } from 'next/navigation';
import { apiLogout } from '@/lib/client';

/** Small footer: backup export + logout. */
export default function Footer() {
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      /* ignore — we redirect regardless */
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="mt-8 flex items-center justify-center gap-4 text-xs text-text-muted">
      <a href="/api/export" className="underline active:text-text-secondary">
        Export data
      </a>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={handleLogout}
        className="underline active:text-text-secondary"
      >
        Log out
      </button>
    </div>
  );
}
