// Optional custom-habit domains — pushups, pullups, and the Japanese/Anki
// tracker. Each keeps its own data model and full screen, but in the UI it is
// "just a custom habit" (see the root CLAUDE.md): nothing is created with the
// account. The user opts in from the add-habit template picker, and the Today
// widget carries a delete button that removes the habit *and its logged data*.
//
// Opt-in is a row in `user_domains`. Deleting a domain drops that row AND the
// domain's data in one transaction — which is also what keeps the boot-time
// backfill in lib/db.ts from resurrecting it, since the backfill only enables a
// domain for users who still have data in it.
//
// SERVER-ONLY. Every query is scoped to `userId`.

import { many, one, run, tx } from './db';
import { todayISO } from './dates';

// `pushups` / `pullups` are the two ORIGINAL hardcoded programs. They're no
// longer offered in the library — a new user builds one from the generic
// "progressive rep program" template instead (a `rep_programs` row) — but they
// remain a real domain so the accounts that predate the library keep them,
// and can delete them.
export const DOMAIN_KEYS = ['pushups', 'pullups', 'japanese'] as const;
export type DomainKey = (typeof DOMAIN_KEYS)[number];

export function isDomainKey(v: unknown): v is DomainKey {
  return typeof v === 'string' && (DOMAIN_KEYS as readonly string[]).includes(v);
}

/**
 * The table holding each domain's logged data. Deleting the domain deletes
 * these rows. These are internal constants (never user input), so they're safe
 * to inline into SQL — same convention as `RepProgramConfig.table`.
 */
const DATA_TABLE: Record<DomainKey, string> = {
  pushups: 'pushup_sessions',
  pullups: 'pullup_sessions',
  japanese: 'anki_days',
};

/**
 * One entry in the custom-habit library — the pre-built trackers a user can
 * pick from after choosing "Custom habit". Two kinds:
 *  • `reps` opens the configurable rep-program form (creates a `rep_programs`
 *    row, so a user can have several).
 *  • every other key is a `DomainKey`: adding it enables that domain, and it
 *    can only be added once.
 * New coded-in custom habits are added HERE.
 */
interface LibraryEntryBase {
  emoji: string;
  title: string;
  desc: string;
}

/** A one-per-account library habit. `href` is where adding it lands the user. */
export type DomainLibraryEntry = LibraryEntryBase & {
  key: DomainKey;
  href: string;
};

export type LibraryEntry = (LibraryEntryBase & { key: 'reps' }) | DomainLibraryEntry;

export const CUSTOM_HABIT_LIBRARY: LibraryEntry[] = [
  {
    key: 'reps',
    emoji: '💪',
    title: 'Progressive rep program',
    desc: 'A ramping strength program — sets, rest, and one more rep every day. Hit every target to advance. Record a guided workout or type your reps.',
  },
  {
    key: 'japanese',
    emoji: '🇯🇵',
    title: 'Anki goal',
    desc: 'Work through an Anki deck at a set pace — log new cards a day and track your streak, pace, and finish estimate.',
    href: '/japanese',
  },
];

export interface UserDomainRow {
  domain: DomainKey;
  created_at: string;
}

/** The domains this user has added, oldest first. */
export function listUserDomains(userId: number): Promise<UserDomainRow[]> {
  return many<UserDomainRow>(
    `SELECT domain, created_at FROM user_domains WHERE user_id = $1 ORDER BY id ASC`,
    [userId]
  );
}

export function getUserDomain(
  userId: number,
  domain: DomainKey
): Promise<UserDomainRow | undefined> {
  return one<UserDomainRow>(
    `SELECT domain, created_at FROM user_domains WHERE user_id = $1 AND domain = $2`,
    [userId, domain]
  );
}

export async function hasUserDomain(
  userId: number,
  domain: DomainKey
): Promise<boolean> {
  return (await getUserDomain(userId, domain)) !== undefined;
}

/**
 * Add a domain. Idempotent — adding one you already have is a no-op.
 *
 * `created_at` is stored as the owner's LOCAL add-day at UTC midnight
 * (`YYYY-MM-DDT00:00:00.000Z`), the same shape the boot backfill uses. This
 * matters because `japanese`'s pace clock starts at this date via
 * `resolveStartDate`, which reads the date part verbatim (no tz conversion). A
 * raw `new Date().toISOString()` would record the UTC instant, so an
 * ahead-of-UTC user adding in their local morning would land on the previous
 * calendar day and start a day "behind" — hence pinning to `todayISO(tz)`.
 */
export async function addUserDomain(
  userId: number,
  domain: DomainKey,
  tz: string
): Promise<void> {
  const createdAt = `${todayISO(tz)}T00:00:00.000Z`;
  await run(
    `INSERT INTO user_domains (user_id, domain, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, domain) DO NOTHING`,
    [userId, domain, createdAt]
  );
}

/**
 * Remove a domain and everything logged in it, atomically. Returns false when
 * the user didn't have it. The caller is responsible for unlinking any video
 * files (collect them *before* calling — the rows are gone afterwards).
 */
export function removeUserDomain(
  userId: number,
  domain: DomainKey
): Promise<boolean> {
  return tx(async (client) => {
    const res = await client.query(
      `DELETE FROM user_domains WHERE user_id = $1 AND domain = $2`,
      [userId, domain]
    );
    if ((res.rowCount ?? 0) === 0) return false;
    await client.query(`DELETE FROM ${DATA_TABLE[domain]} WHERE user_id = $1`, [
      userId,
    ]);
    return true;
  });
}
