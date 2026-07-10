'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { m } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Fixed bottom tab bar — the app's primary navigation. The active pill slides
 * between tabs via a shared-element layoutId (auto-neutralized under reduced
 * motion).
 *
 * Only genuinely distinct domains get a tab. Pushups/pullups/japanese are just
 * custom habits, so they're NOT tabs — they live inline on the Today screen as
 * summary widgets (see app/page.tsx) and are reached via those widgets. Fasting
 * is the one non-habit domain, so it keeps its own tab.
 */
const TABS: { href: string; label: string; icon: ReactNode }[] = [
  { href: '/', label: 'Today', icon: <TodayIcon /> },
  { href: '/insights', label: 'Insights', icon: <InsightsIcon /> },
  { href: '/fasts', label: 'Fasting', icon: <FastingIcon /> },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/habits');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
  const pathname = usePathname();

  // The login screen has no navigation.
  if (pathname === '/login') return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
      <div className="safe-bottom w-full max-w-md border-t border-border bg-bg/85 px-2 pt-1.5 backdrop-blur-lg">
        <ul className="flex items-stretch justify-around">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className="relative flex flex-col items-center gap-0.5 rounded-btn px-2 py-1.5"
                >
                  {active && (
                    <m.span
                      layoutId="navpill"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      className="absolute inset-x-1 inset-y-0 -z-0 rounded-btn bg-accent/12"
                    />
                  )}
                  <span
                    className={`relative z-10 transition-colors ${
                      active ? 'text-accent-400' : 'text-text-muted'
                    }`}
                  >
                    {tab.icon}
                  </span>
                  <span
                    className={`relative z-10 text-[10px] font-medium transition-colors ${
                      active ? 'text-accent-400' : 'text-text-muted'
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

// ── Icons (inline, stroke = currentColor) ───────────────────────────

function TodayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function FastingIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M12 2h0M9 2h6" />
    </svg>
  );
}
