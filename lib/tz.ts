// Server-side timezone resolution. Reads the owner's IANA zone from the `tz`
// cookie (set automatically by <TimezoneSync>). SERVER-ONLY: this pulls in
// `next/headers`, so never import it from a client component — client code
// receives the resolved zone as a plain `tz` prop instead.

import { cookies } from 'next/headers';
import { TZ_COOKIE, isValidTimeZone } from './dates';

/**
 * Fallback zone used before the browser has set the cookie (the very first
 * request of a fresh session), after which <TimezoneSync> takes over. This is
 * the server's own zone, which honors the standard `TZ` env var — so setting
 * `TZ=America/New_York` on Railway makes even that first paint match the owner.
 * Without it the fallback is UTC, corrected within a tick by the client.
 */
function fallbackTimezone(): string {
  try {
    const sys = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(sys)) return sys;
  } catch {
    /* fall through */
  }
  return 'UTC';
}

/**
 * The owner's IANA timezone for this request. Reads the `tz` cookie and
 * validates it (a tampered/stale value falls back rather than throwing).
 * Works in both Server Components and Route Handlers.
 */
export function getTimezone(): string {
  const raw = cookies().get(TZ_COOKIE)?.value;
  return isValidTimeZone(raw) ? raw : fallbackTimezone();
}
