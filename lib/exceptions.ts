import { many, run } from './db';

// Streak exceptions ("rest days"). One uniform mechanism for marking a missed
// day as excepted so it doesn't break a tracker's streak — see the table note in
// lib/db.ts. Every query is user_id-scoped; a (scope, ref) pair identifies the
// tracker (habit id / rep-or-plank program key / 'japanese').

export type ExceptionScope = 'habit' | 'rep' | 'plank' | 'anki';

const SCOPES: readonly ExceptionScope[] = ['habit', 'rep', 'plank', 'anki'];

export function isExceptionScope(v: unknown): v is ExceptionScope {
  return typeof v === 'string' && (SCOPES as readonly string[]).includes(v);
}

/** The excepted dates for one tracker, ascending. */
export async function listExceptions(
  userId: number,
  scope: ExceptionScope,
  ref: string
): Promise<string[]> {
  const rows = await many<{ date: string }>(
    `SELECT date FROM streak_exceptions
     WHERE user_id = $1 AND scope = $2 AND ref = $3
     ORDER BY date ASC`,
    [userId, scope, ref]
  );
  return rows.map((r) => r.date);
}

/** One excepted date and its (optional) reason. */
export interface ExceptionDetail {
  date: string;
  reason: string | null;
}

/**
 * The excepted dates for one tracker WITH their reasons, ascending. Used by the
 * UIs (calendar / rest-day editor) that show the note or pre-fill it when
 * re-marking; the streak walks only need the dates (`listExceptions`).
 */
export async function listExceptionDetails(
  userId: number,
  scope: ExceptionScope,
  ref: string
): Promise<ExceptionDetail[]> {
  return many<ExceptionDetail>(
    `SELECT date, reason FROM streak_exceptions
     WHERE user_id = $1 AND scope = $2 AND ref = $3
     ORDER BY date ASC`,
    [userId, scope, ref]
  );
}

/**
 * Every exception on ONE date across ALL trackers, keyed by `"${scope}:${ref}"`
 * → reason. Powers the Today screen: a habit OR custom habit excused for the
 * selected day drops out of the "to do" list. One query covers plain habits
 * (`habit:<id>`) and custom habits (`rep:<key>` / `plank:<key>` / `anki:japanese`).
 */
export async function listExceptionsForDate(
  userId: number,
  date: string
): Promise<Map<string, string | null>> {
  const rows = await many<{ scope: string; ref: string; reason: string | null }>(
    `SELECT scope, ref, reason FROM streak_exceptions
     WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
  const map = new Map<string, string | null>();
  for (const r of rows) map.set(`${r.scope}:${r.ref}`, r.reason);
  return map;
}

/** The excepted dates for one tracker as a Set — the shape streak walks want. */
export async function listExceptionSet(
  userId: number,
  scope: ExceptionScope,
  ref: string
): Promise<Set<string>> {
  return new Set(await listExceptions(userId, scope, ref));
}

/**
 * Excepted dates for MANY refs in one scope, keyed by ref → Set<date>. Batched
 * equivalent of `listExceptionSet` used by the Today/Insights habit-stats batch
 * so N habits cost one query, not N. Refs with no exceptions are absent from the
 * map (callers default to an empty set).
 */
export async function listExceptionSetsForRefs(
  userId: number,
  scope: ExceptionScope,
  refs: string[]
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (refs.length === 0) return map;
  const rows = await many<{ ref: string; date: string }>(
    `SELECT ref, date FROM streak_exceptions
     WHERE user_id = $1 AND scope = $2 AND ref = ANY($3)`,
    [userId, scope, refs]
  );
  for (const row of rows) {
    const set = map.get(row.ref);
    if (set) set.add(row.date);
    else map.set(row.ref, new Set([row.date]));
  }
  return map;
}

/**
 * Mark (scope, ref, date) as an exception, with an optional reason. Idempotent
 * on the (scope, ref, date) key; re-marking an existing day updates its reason
 * (so editing the note in the UI sticks).
 */
export async function setException(
  userId: number,
  scope: ExceptionScope,
  ref: string,
  date: string,
  reason: string | null = null
): Promise<void> {
  await run(
    `INSERT INTO streak_exceptions (user_id, scope, ref, date, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, scope, ref, date) DO UPDATE SET reason = EXCLUDED.reason`,
    [userId, scope, ref, date, reason, new Date().toISOString()]
  );
}

/**
 * Delete EVERY exception for one tracker — called when the tracker itself is
 * deleted (a habit, a rep/plank program, or a built-in domain). `streak_exceptions`
 * has no foreign key on `(scope, ref)` (the ref is a text key spanning several
 * tables), so nothing cascades these rows away; the owner must delete them
 * explicitly or they orphan — and, for the fixed-ref built-ins, resurrect if the
 * domain is re-added. Scoped to the user like every query here.
 */
export async function deleteExceptionsForRef(
  userId: number,
  scope: ExceptionScope,
  ref: string
): Promise<void> {
  await run(
    `DELETE FROM streak_exceptions WHERE user_id = $1 AND scope = $2 AND ref = $3`,
    [userId, scope, ref]
  );
}

/** Clear an exception. Returns true if a row was removed. */
export async function clearException(
  userId: number,
  scope: ExceptionScope,
  ref: string,
  date: string
): Promise<boolean> {
  return (
    (await run(
      `DELETE FROM streak_exceptions
       WHERE user_id = $1 AND scope = $2 AND ref = $3 AND date = $4`,
      [userId, scope, ref, date]
    )) > 0
  );
}
