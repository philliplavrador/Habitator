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

// ── Rep programs (pushups, pullups) ─────────────────────────────────
//
// Both are the same shape: 3 sets, a JSON target/reps pair per attempt, and
// progression driven purely by the count of completed sessions. The generic
// engine (lib/repProgram.ts) is configured once per program.

/** Which rep program a row/route/URL belongs to. */
export type RepProgramKey = 'pushups' | 'pullups';

/** Static definition of one rep program. */
export interface RepProgramConfig {
  key: RepProgramKey;
  table: string; // sqlite table name
  label: string; // "Pushups" | "Pullups"
  sets: number; // sets per day (3)
  day1Total: number; // total reps on day 1 (pushups 54, pullups 15)
  programDays: number; // length of the ramp
  restSeconds: number; // rest between sets
  /** Human blurb for the finished state, e.g. "3 × 50". */
  finishLabel: string;
}

/** One logged attempt at a program day (may or may not have completed it). */
export interface RepSession {
  id: number;
  date: string; // YYYY-MM-DD
  day_index: number; // program day this attempt targeted
  target: number[]; // [t1, t2, t3] prescribed reps
  reps: number[]; // [r1, r2, r3] actual reps done
  completed: boolean; // met target on every set
  /** Optional stored video filename; null when no video is attached. */
  video: string | null;
  created_at: string;
}

/** The computed state of a rep program — drives its card + Today summary. */
export interface RepProgramState {
  key: RepProgramKey;
  label: string;
  programDays: number;
  restSeconds: number;
  sets: number;
  finishLabel: string;
  completedCount: number; // sessions completed
  currentDay: number; // completedCount + 1, capped at programDays
  target: number[]; // prescription for currentDay
  daysLeft: number; // programDays - completedCount
  programComplete: boolean; // completedCount >= programDays
  /** A completed session dated today, if any — so the card can rest. */
  doneToday: RepSession | null;
  /** The most recent attempt overall — for "fell short" messaging. */
  lastAttempt: RepSession | null;
  /**
   * Attempt streak: consecutive local days on which at least one session was
   * logged (pass OR fail). Only a fully skipped day breaks it; a today with no
   * attempt yet does not (the run may still be anchored at yesterday).
   */
  currentStreak: number;
  longestStreak: number;
}

/** A day's outcome in the session heatmap. */
export type RepDayStatus = 'complete' | 'attempted';

// Back-compat alias — the pushup feature shipped under this name; still used
// by lib/analytics.ts.
export type PushupSession = RepSession;

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
