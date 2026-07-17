import { many, one, run } from './db';
import { addDays, compareISO, nowISO, rangeDates, todayISO } from './dates';
import { getUserDomain } from './domains';
import { listExceptionSet } from './exceptions';
import type { AnkiDay, AnkiDayInput, AnkiState } from './types';

/** Shared empty exception set so exception-unaware callers allocate nothing. */
const NO_EXCEPTIONS: ReadonlySet<string> = new Set<string>();

// ── Config ──────────────────────────────────────────────────────────
//
// The tracked goal: finishing the first 2,000 cards of the Core 2k/6k Japanese
// Anki deck (5,999 cards total). Each day the owner logs how many *new* cards
// they studied; the target pace is a floor of `dailyMin` new cards/day, which
// also anchors the two completion estimates and the "ahead/behind pace" figure.
//
// `startDate` is only the FLOOR on how early a day may be logged (and the
// fallback start). The pace clock actually starts the day the user added the
// habit — see `resolveStartDate` — so someone who adds it a year from now isn't
// instantly a year behind.
export const ANKI = {
  deckName: 'Core 2k/6k Japanese',
  deckTotal: 5999,
  goal: 2000,
  dailyMin: 10,
  startDate: '2026-07-04',
} as const;

// The original owner's pre-tracker study days used to be seeded here on first
// boot. They now live in the live database and migrate across to the Fifi
// account, so there's no auto-seed anymore — every new user starts empty and
// scoped queries keep the accounts separate.

// ── Row hydration ───────────────────────────────────────────────────

function hydrate(row: unknown): AnkiDay {
  const r = row as { id: number; date: string; new_cards: number; created_at: string };
  return { id: r.id, date: r.date, new_cards: r.new_cards, created_at: r.created_at };
}

// ── Public queries / mutations (all scoped to userId) ───────────────

/** Every logged day, newest first. */
export async function listAnkiDays(userId: number): Promise<AnkiDay[]> {
  const rows = await many(
    `SELECT * FROM anki_days WHERE user_id = $1 ORDER BY date DESC`,
    [userId]
  );
  return rows.map(hydrate);
}

export async function getAnkiDay(
  userId: number,
  id: number
): Promise<AnkiDay | undefined> {
  const row = await one(
    `SELECT * FROM anki_days WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return row ? hydrate(row) : undefined;
}

/** Upsert a day's new-card count (one row per date, per user). */
export async function setAnkiDay(
  userId: number,
  input: AnkiDayInput
): Promise<AnkiDay> {
  const row = await one(
    `INSERT INTO anki_days (user_id, date, new_cards, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date) DO UPDATE SET new_cards = EXCLUDED.new_cards
     RETURNING *`,
    [userId, input.date, input.new_cards, nowISO()]
  );
  return hydrate(row);
}

/** Update a day's count by id. Returns the fresh row, or undefined. */
export async function updateAnkiDay(
  userId: number,
  id: number,
  newCards: number
): Promise<AnkiDay | undefined> {
  const changed = await run(
    `UPDATE anki_days SET new_cards = $1 WHERE id = $2 AND user_id = $3`,
    [newCards, id, userId]
  );
  if (changed === 0) return undefined;
  return getAnkiDay(userId, id);
}

/** Delete a day by id. Returns true if a row was removed. */
export async function deleteAnkiDay(
  userId: number,
  id: number
): Promise<boolean> {
  return (
    (await run(`DELETE FROM anki_days WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])) > 0
  );
}

// ── State computation ───────────────────────────────────────────────

/**
 * The day this user's deck clock starts: the earlier of when they added the
 * habit and their first logged day (a backdated log pulls the start back with
 * it). Falls back to the deck's own start date when neither exists.
 */
function resolveStartDate(addedAt: string | undefined, daysAsc: AnkiDay[]): string {
  const candidates = [addedAt?.slice(0, 10), daysAsc[0]?.date].filter(
    (d): d is string => typeof d === 'string' && d !== ''
  );
  if (candidates.length === 0) return ANKI.startDate;
  return candidates.reduce((a, b) => (compareISO(a, b) <= 0 ? a : b));
}

/**
 * Load every day for the user (ascending) and compute the full tracker state,
 * returning BOTH so a caller that also needs the day list reads `anki_days`
 * ONCE. The two reads (the day log and the domain row that dates the pace clock)
 * are independent, so they run in one wave; the derived state is unchanged.
 */
export async function getAnkiStateWithDays(
  userId: number,
  tz: string
): Promise<{ state: AnkiState; daysAsc: AnkiDay[]; exceptions: string[] }> {
  const [dayRows, added, exceptions] = await Promise.all([
    many(`SELECT * FROM anki_days WHERE user_id = $1 ORDER BY date ASC`, [
      userId,
    ]),
    getUserDomain(userId, 'japanese'),
    listExceptionSet(userId, 'anki', 'japanese'),
  ]);
  const daysAsc = dayRows.map(hydrate);
  const state = computeAnkiState(
    daysAsc,
    todayISO(tz),
    resolveStartDate(added?.created_at, daysAsc),
    exceptions
  );
  return { state, daysAsc, exceptions: [...exceptions].sort() };
}

/** Load every day for the user and compute the full tracker state. */
export async function getAnkiState(
  userId: number,
  tz: string
): Promise<AnkiState> {
  return (await getAnkiStateWithDays(userId, tz)).state;
}

/**
 * Pure derivation of the tracker state from the ascending day log and today's
 * date. Split out from the DB access so it's trivially testable/reviewable.
 *
 * The two completion estimates:
 *  • baselineFinish (ETA #1) — the fixed deadline if the owner only ever does
 *    the minimum: start + ceil(goal/dailyMin) - 1 days. Independent of actual
 *    progress, so it reads as the pace commitment.
 *  • projectedFinish (ETA #2) — realistic: keep the cards already banked, then
 *    do dailyMin/day for every future day → today + ceil(remaining/dailyMin).
 *    Because it credits work already done, being ahead of pace pulls it earlier
 *    than baselineFinish.
 */
export function computeAnkiState(
  daysAsc: AnkiDay[],
  today: string,
  startDate: string = ANKI.startDate,
  exceptions: ReadonlySet<string> = NO_EXCEPTIONS
): AnkiState {
  const { deckName, deckTotal, goal, dailyMin } = ANKI;

  // Cumulative total + the day the goal was first crossed.
  let totalDone = 0;
  let goalReachedDate: string | null = null;
  for (const d of daysAsc) {
    const before = totalDone;
    totalDone += d.new_cards;
    if (goalReachedDate === null && before < goal && totalDone >= goal) {
      goalReachedDate = d.date;
    }
  }
  const goalReached = totalDone >= goal;
  const remaining = Math.max(0, goal - totalDone);
  const cardsPct = goal > 0 ? Math.max(0, Math.min(1, totalDone / goal)) : 0;

  // Today.
  const todayRow = daysAsc.find((d) => d.date === today);
  const todayCount = todayRow ? todayRow.new_cards : 0;
  const loggedToday = todayRow !== undefined;

  // Days-left plan — progress through the fixed min-pace schedule.
  const totalPlanDays = Math.ceil(goal / dailyMin);
  const daysElapsed =
    compareISO(today, startDate) < 0 ? 0 : rangeDates(startDate, today).length;
  const daysLeftPlan = Math.max(0, totalPlanDays - daysElapsed);
  const planPct =
    totalPlanDays > 0 ? Math.max(0, Math.min(1, daysElapsed / totalPlanDays)) : 0;

  // Pace vs dailyMin/day.
  const expectedByNow = dailyMin * daysElapsed;
  const paceDeltaCards = totalDone - expectedByNow;
  const paceDeltaDays = Math.round(paceDeltaCards / dailyMin);

  // Completion estimates.
  const baselineFinish = addDays(startDate, totalPlanDays - 1);
  const projectedDaysToGo = Math.ceil(remaining / dailyMin);
  const projectedFinish = goalReached
    ? goalReachedDate ?? today
    : addDays(today, projectedDaysToGo);

  const { current: currentStreak, longest: longestStreak } = computeStreak(
    daysAsc,
    dailyMin,
    today,
    exceptions
  );

  return {
    deckName,
    deckTotal,
    goal,
    dailyMin,
    startDate,
    today,
    totalDone,
    remaining,
    cardsPct,
    goalReached,
    goalReachedDate,
    todayCount,
    loggedToday,
    totalPlanDays,
    daysElapsed,
    daysLeftPlan,
    planPct,
    expectedByNow,
    paceDeltaCards,
    paceDeltaDays,
    baselineFinish,
    projectedFinish,
    projectedDaysToGo,
    currentStreak,
    longestStreak,
    daysLogged: daysAsc.length,
  };
}

/**
 * Streak = consecutive calendar days that met the daily minimum. `current` walks
 * back from today when today met the minimum; if today has no entry yet it falls
 * back to yesterday (grace — the day isn't over). But a today that WAS logged and
 * fell short of the minimum breaks the run immediately (it counts as a miss, not
 * an unfinished day). `longest` is the longest such run ever.
 *
 * A user-marked exception (rest day) is transparent: it bridges a gap between
 * met days without adding to the count, and an excepted today can't break the
 * run even if it was logged below the minimum.
 */
function computeStreak(
  daysAsc: AnkiDay[],
  dailyMin: number,
  today: string,
  exceptions: ReadonlySet<string> = NO_EXCEPTIONS
): { current: number; longest: number } {
  const met = new Set<string>();
  const logged = new Set<string>();
  for (const d of daysAsc) {
    logged.add(d.date);
    if (d.new_cards >= dailyMin) met.add(d.date);
  }
  // A day counts toward the run only if it met the minimum; an excepted day is
  // transparent (bridges but doesn't add).
  const bridged = (d: string) => met.has(d) || exceptions.has(d);

  // Longest run: walk the union of met + excepted dates, counting only met ones.
  const sorted = [...new Set([...met, ...exceptions])].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    const consecutive = prev !== null && addDays(prev, 1) === d;
    run = consecutive ? run : 0;
    if (met.has(d)) run++;
    if (run > longest) longest = run;
    prev = d;
  }

  let current = 0;
  let cursor: string | null;
  if (bridged(today)) cursor = today; // met OR an excused rest day today
  else if (logged.has(today)) cursor = null; // logged today but below min → broken
  else cursor = addDays(today, -1); // not logged yet → grace, resume from yesterday
  while (cursor !== null && bridged(cursor)) {
    if (met.has(cursor)) current++;
    cursor = addDays(cursor, -1);
  }

  return { current, longest };
}
