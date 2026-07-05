'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TZ_COOKIE } from '@/lib/dates';

/**
 * Keeps the server in sync with the browser's real timezone, automatically.
 *
 * On mount it reads the browser's IANA zone and, if the `tz` cookie is missing
 * or stale (e.g. the owner travelled), writes the fresh value and triggers a
 * server re-render so every server-computed "today"/timestamp switches to the
 * owner's actual zone. Renders nothing. This is the only moving part the owner
 * never has to think about — timezone handling is fully automatic.
 */
export default function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    let tz: string;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz) return;

    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${TZ_COOKIE}=`))
      ?.slice(TZ_COOKIE.length + 1);

    if (current === tz) return; // already correct — nothing to do

    // IANA zone names are cookie-safe (letters, digits, '/', '_', '+', '-').
    // 1-year persistence; Lax so it rides normal navigations.
    document.cookie = `${TZ_COOKIE}=${tz}; path=/; max-age=31536000; samesite=lax`;
    // Re-render server components with the corrected zone.
    router.refresh();
  }, [router]);

  return null;
}
