'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Minimal two-tab nav so Habits (Today) and Fasting can coexist. The app has
// no other global nav; this is rendered at the top of both screens.
const TABS = [
  { href: '/', label: 'Today' },
  { href: '/fasts', label: 'Fasting' },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex gap-1 rounded-btn border border-border bg-surface p-1">
      {TABS.map((tab) => {
        const active =
          tab.href === '/'
            ? pathname === '/'
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 rounded-btn px-4 py-2 text-center text-sm font-semibold transition-colors ${
              active
                ? 'bg-accent text-white'
                : 'text-text-secondary active:bg-surface2'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
