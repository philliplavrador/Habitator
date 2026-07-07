// Shared server-page bootstrap. Nearly every server page opens by resolving the
// same trio: the authed user id, the owner's timezone, and "today" in that zone.
// `requirePageContext()` collapses that copy-pasted quartet into one call while
// preserving `requireUserId`'s redirect-on-unauthed behavior exactly (it throws
// the Next `redirect('/login')`, so an unauthed request never reaches the page
// body). SERVER-ONLY: pulls in `next/headers` via lib/auth and lib/tz.

import { requireUserId } from './auth';
import { getTimezone } from './tz';
import { todayISO } from './dates';

/** The request-scoped context every server page needs up front. */
export interface PageContext {
  /** The logged-in user's id (queries stay scoped to this). */
  userId: number;
  /** The owner's resolved IANA timezone for this request. */
  tz: string;
  /** Today's calendar date in `tz`, as YYYY-MM-DD. */
  today: string;
}

/**
 * Resolve the standard server-page context. Redirects to /login when unauthed
 * (via {@link requireUserId}), so code after this call always has a real user.
 */
export async function requirePageContext(): Promise<PageContext> {
  const userId = await requireUserId();
  const tz = getTimezone();
  const today = todayISO(tz);
  return { userId, tz, today };
}
