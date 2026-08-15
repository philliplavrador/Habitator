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
 *
 * It ALSO mirrors the zone onto the user row (once per browser session, via
 * sessionStorage). The cookie serves every request the owner makes, but the
 * reminder cron has no cookie — it needs the zone in the database to know when
 * a habit's local reminder time has arrived. The session guard keeps this to one
 * tiny request per session rather than one per page, and it deliberately runs
 * even when the cookie is already correct, since a correct cookie says nothing
 * about whether the column has been filled in yet.
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

    // Mirror to the DB once per session, independent of the cookie check below.
    try {
      if (sessionStorage.getItem('tz-synced') !== tz) {
        fetch('/api/tz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tz }),
        })
          .then((r) => {
            if (r.ok) sessionStorage.setItem('tz-synced', tz);
          })
          .catch(() => {
            // Offline or logged out — the next session tries again.
          });
      }
    } catch {
      // sessionStorage can throw in private modes; the mirror is best-effort.
    }

    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${TZ_COOKIE}=`))
      ?.slice(TZ_COOKIE.length + 1);

    if (current === tz) return; // cookie already correct — nothing more to do

    // IANA zone names are cookie-safe (letters, digits, '/', '_', '+', '-').
    // 1-year persistence; Lax so it rides normal navigations.
    document.cookie = `${TZ_COOKIE}=${tz}; path=/; max-age=31536000; samesite=lax`;
    // Re-render server components with the corrected zone.
    router.refresh();
  }, [router]);

  return null;
}
