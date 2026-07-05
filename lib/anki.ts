import { db } from './db';
import { addDays, compareISO, nowISO, rangeDates, todayISO } from './dates';
import type { AnkiDay, AnkiDayInput, AnkiState } from './types';

// ── Config ──────────────────────────────────────────────────────────
//
// The tracked goal: finishing the first 2,000 cards of the Core 2k/6k Japanese
// Anki deck (5,999 cards total). Each day the owner logs how many *new* cards
// they studied; the target pace is a floor of `dailyMin` new cards/day, which
// also anchors the two completion estimates and the "ahead/behind pace" figure.
export const ANKI = {
  deckName: 'Core 2k/6k Japanese',
  deckTotal: 5999,
  goal: 2000,
  dailyMin: 10,
  startDate: '2026-07-04',
} as const;

// Study days that happened before the tracker existed. Seeded exactly once (see
// seedOnce); INSERT OR IGNORE means this never clobbers a day already logged.
const SEED_DAYS: AnkiDayInput[] = [
  { date: '2026-07-04', new_cards: 50 },
  { date: '2026-07-05', new_cards: 50 },
];
const SEED_KEY = 'anki_seeded';

// ── Prepared statements ─────────────────────────────────────────────

const stmtListDesc = db.prepare<[]>(`SELECT * FROM anki_days ORDER BY date DESC`);
const stmtListAsc = db.prepare<[]>(`SELECT * FROM anki_days ORDER BY date ASC`);
const stmtGetById = db.prepare<[number]>(`SELECT * FROM anki_days WHERE id = ?`);
const stmtGetByDate = db.prepare<[string]>(`SELECT * FROM anki_days WHERE date = ?`);
const stmtUpsert = db.prepare(
  `INSERT INTO anki_days (date, new_cards, created_at)
   VALUES (@date, @new_cards, @created_at)
   ON CONFLICT (date) DO UPDATE SET new_cards = excluded.new_cards`
);
const stmtInsertIgnore = db.prepare(
  `INSERT OR IGNORE INTO anki_days (date, new_cards, created_at)
   VALUES (@date, @new_cards, @created_at)`
);
const stmtUpdateById = db.prepare(
  `UPDATE anki_days SET new_cards = @new_cards WHERE id = @id`
);
const stmtDeleteById = db.prepare<[number]>(`DELETE FROM anki_days WHERE id = ?`);
const stmtGetMeta = db.prepare<[string]>(`SELECT value FROM app_meta WHERE key = ?`);
const stmtSetMeta = db.prepare(
  `INSERT OR IGNORE INTO app_meta (key, value) VALUES (@key, @value)`
);

// ── One-time seed ───────────────────────────────────────────────────

let seededThisProcess = false; // avoid a DB round-trip on every call

/**
 * Insert the pre-tracker study days exactly once per database. Guarded by an
 * `app_meta` flag so a reboot never re-seeds and a later edit/delete is never
 * undone; INSERT OR IGNORE additionally protects against colliding with a day
 * the owner has already logged. The whole thing runs in a transaction so a
 * concurrent boot can't seed twice.
 */
function seedOnce(): void {
  if (seededThisProcess) return;
  db.transaction(() => {
    if (stmtGetMeta.get(SEED_KEY)) return; // already seeded in a prior run
    const ts = nowISO();
    for (const d of SEED_DAYS) {
      stmtInsertIgnore.run({ date: d.date, new_cards: d.new_cards, created_at: ts });
    }
    stmtSetMeta.run({ key: SEED_KEY, value: '1' });
  })();
  seededThisProcess = true;
}

// ── Row hydration ───────────────────────────────────────────────────

function hydrate(row: unknown): AnkiDay {
  const r = row as { id: number; date: string; new_cards: number; created_at: string };
  return { id: r.id, date: r.date, new_cards: r.new_cards, created_at: r.created_at };
}

// ── Public queries / mutations ──────────────────────────────────────

/** Every logged day, newest first. */
export function listAnkiDays(): AnkiDay[] {
  seedOnce();
  return (stmtListDesc.all() as unknown[]).map(hydrate);
}

export function getAnkiDay(id: number): AnkiDay | undefined {
  const row = stmtGetById.get(id);
  return row ? hydrate(row) : undefined;
}

/** Upsert a day's new-card count (one row per date). */
export function setAnkiDay(input: AnkiDayInput): AnkiDay {
  seedOnce();
  stmtUpsert.run({ date: input.date, new_cards: input.new_cards, created_at: nowISO() });
  return hydrate(stmtGetByDate.get(input.date));
}

/** Update a day's count by id. Returns the fresh row, or undefined. */
export function updateAnkiDay(id: number, newCards: number): AnkiDay | undefined {
  if (!getAnkiDay(id)) return undefined;
  stmtUpdateById.run({ id, new_cards: newCards });
  return getAnkiDay(id);
}

/** Delete a day by id. Returns true if a row was removed. */
export function deleteAnkiDay(id: number): boolean {
  return stmtDeleteById.run(id).changes > 0;
}

// ── State computation ───────────────────────────────────────────────

/** Load every day, seed if needed, and compute the full tracker state. */
export function getAnkiState(tz: string): AnkiState {
  seedOnce();
  const daysAsc = (stmtListAsc.all() as unknown[]).map(hydrate);
  return computeAnkiState(daysAsc, todayISO(tz));
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
export function computeAnkiState(daysAsc: AnkiDay[], today: string): AnkiState {
  const { deckName, deckTotal, goal, dailyMin, startDate } = ANKI;

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
    today
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
 */
function computeStreak(
  daysAsc: AnkiDay[],
  dailyMin: number,
  today: string
): { current: number; longest: number } {
  const met = new Set<string>();
  const logged = new Set<string>();
  for (const d of daysAsc) {
    logged.add(d.date);
    if (d.new_cards >= dailyMin) met.add(d.date);
  }

  const sorted = [...met].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev && addDays(prev, 1) === d) run++;
    else run = 1;
    if (run > longest) longest = run;
    prev = d;
  }

  let current = 0;
  let cursor: string | null;
  if (met.has(today)) cursor = today;
  else if (logged.has(today)) cursor = null; // logged today but below min → broken
  else cursor = addDays(today, -1); // not logged yet → grace, resume from yesterday
  while (cursor !== null && met.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, longest };
}
