// Shared domain types. Mirror the SQLite schema in lib/db.ts.

export type EntryStatus = 'pass' | 'fail';

export interface Habit {
  id: number;
  name: string;
  details: string;
  exceptions: string;
  start_date: string; // YYYY-MM-DD
  sort_order: number;
  archived: number; // 0 | 1 (SQLite has no boolean)
  created_at: string; // ISO timestamp
}

export interface Entry {
  id: number;
  habit_id: number;
  date: string; // YYYY-MM-DD
  status: EntryStatus;
  created_at: string; // ISO timestamp
}

export interface HabitStats {
  passes: number;
  fails: number;
  recorded: number; // passes + fails
  /** passes / recorded, in [0,1]; null when there are no recorded days. */
  completionRate: number | null;
  currentStreak: number;
  longestStreak: number;
}

/** A habit plus its status on a particular day — used by the Today screen. */
export interface HabitDayView {
  habit: Habit;
  status: EntryStatus | null;
  currentStreak: number;
}

/** Input accepted when creating/updating a habit. */
export interface HabitInput {
  name: string;
  details: string;
  exceptions: string;
  start_date: string;
}

// ── Fasting ─────────────────────────────────────────────────────────

export interface Fast {
  id: number;
  start_at: string; // ISO timestamp
  end_at: string | null; // ISO timestamp; null while in progress
  goal_hours: number; // target duration in hours
  note: string;
  created_at: string; // ISO timestamp
}

export interface FastStats {
  totalFasts: number; // completed fasts
  /** Mean length of completed fasts, in hours; null when there are none. */
  avgHours: number | null;
  /** Longest completed fast, in hours; null when there are none. */
  longestHours: number | null;
  totalHours: number; // summed length of completed fasts
  goalsHit: number; // completed fasts whose elapsed >= goal
}

/**
 * Input accepted when creating a fast.
 * - Live fast: send `goal_hours` (the target window length); `end_at` omitted.
 * - Logged fast: send `end_at` (an already-finished fast); `goal_hours` is
 *   derived from the start→end window.
 */
export interface StartFastInput {
  goal_hours?: number;
  start_at?: string; // defaults to now
  end_at?: string; // present → logging a completed fast
  note?: string;
}

/** Partial input accepted when editing/ending a fast. */
export interface UpdateFastInput {
  start_at?: string;
  end_at?: string | null;
  goal_hours?: number;
  note?: string;
}

// ── Pushup program ──────────────────────────────────────────────────

/** One logged attempt at a program day (may or may not have completed it). */
export interface PushupSession {
  id: number;
  date: string; // YYYY-MM-DD
  day_index: number; // program day 1..97 this attempt targeted
  target: number[]; // [t1, t2, t3] prescribed reps
  reps: number[]; // [r1, r2, r3] actual reps done
  completed: boolean; // met target on every set
  created_at: string;
}

// ── Anki — Core 2k/6k Japanese deck ─────────────────────────────────

/** One day's log: how many new cards were studied on that date. */
export interface AnkiDay {
  id: number;
  date: string; // YYYY-MM-DD (local day)
  new_cards: number; // new cards studied that day (>= 0)
  created_at: string; // ISO timestamp
}

/** Input accepted when logging/upserting a day. */
export interface AnkiDayInput {
  date: string; // YYYY-MM-DD
  new_cards: number;
}

/**
 * Full computed state of the deck goal — drives the /japanese screen. All the
 * derived figures the tracker shows (progress, pace, the two completion ETAs,
 * days-left, streak) live here so the server computes them once and the client
 * just renders.
 */
export interface AnkiState {
  // ── Fixed config ──
  deckName: string;
  deckTotal: number; // cards in the whole deck (context only)
  goal: number; // cards to "complete" — the target
  dailyMin: number; // the pace baseline, new cards/day
  startDate: string; // YYYY-MM-DD
  today: string; // YYYY-MM-DD in the owner's tz

  // ── Cards progress ──
  totalDone: number; // sum of new_cards across all days
  remaining: number; // max(0, goal - totalDone)
  cardsPct: number; // totalDone / goal, clamped 0..1
  goalReached: boolean;
  goalReachedDate: string | null; // day the cumulative first hit the goal

  // ── Today ──
  todayCount: number; // new_cards logged today (0 if none)
  loggedToday: boolean;

  // ── Days-left plan (vs the fixed min-pace schedule) ──
  totalPlanDays: number; // ceil(goal / dailyMin)
  daysElapsed: number; // inclusive days from start → today (0 before start)
  daysLeftPlan: number; // max(0, totalPlanDays - daysElapsed)
  planPct: number; // daysElapsed / totalPlanDays, clamped 0..1

  // ── Pace (vs dailyMin/day) ──
  expectedByNow: number; // dailyMin * daysElapsed
  paceDeltaCards: number; // totalDone - expectedByNow (+ ahead / - behind)
  paceDeltaDays: number; // round(paceDeltaCards / dailyMin)

  // ── Estimated completion ──
  baselineFinish: string; // ETA if only ever dailyMin/day from the start (ETA #1)
  projectedFinish: string | null; // done-so-far + dailyMin/day for future days (ETA #2)
  projectedDaysToGo: number; // ceil(remaining / dailyMin)

  // ── Streak (consecutive days meeting the daily minimum) ──
  currentStreak: number;
  longestStreak: number;

  daysLogged: number; // count of logged days
}

/** The computed state of the program — drives the Today-screen card. */
export interface PushupState {
  programDays: number; // 97
  restSeconds: number; // 90
  completedCount: number; // sessions completed
  currentDay: number; // completedCount + 1, capped at programDays
  target: number[]; // prescription for currentDay
  daysLeft: number; // programDays - completedCount
  programComplete: boolean; // completedCount >= programDays
  /** A completed session dated today, if any — so the card can rest. */
  doneToday: PushupSession | null;
  /** The most recent attempt overall — for "fell short" messaging. */
  lastAttempt: PushupSession | null;
}
