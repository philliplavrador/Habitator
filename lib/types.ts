// Shared domain types. Mirror the SQLite schema in lib/db.ts.

export type EntryStatus = 'pass' | 'fail';

/**
 * Two kinds of habit, with opposite default semantics:
 * - `build` — a thing to DO every day (e.g. take meds). Each day starts unchecked
 *   and you actively mark it `pass`. Blank days are exceptions (skipped).
 * - `quit`  — a thing to AVOID (e.g. no social media before noon). Every day is
 *   clean by default; the ONLY recorded entry is an explicit `fail` (a slip).
 *   Blank in-range days count as clean, and the streak is the run of clean days.
 */
export type HabitKind = 'build' | 'quit';

/**
 * When a habit is expected. Stored as JSON-in-TEXT in `habits.schedule`
 * (NULL ⇒ daily, for backward-compat with every pre-schedule row). Parsed to
 * this union by lib/schedule.ts; the row hydrator swaps the raw string for it.
 *
 * - `daily`   — every day (the default). Lenient: a blank day is an exception,
 *   never a miss (preserves historical stats; mirrors the owner's spreadsheet).
 * - `weekdays`— only the listed weekdays (0=Sun … 6=Sat), e.g. every Wed.
 * - `interval`— every N days counted from `start_date` (every other day = 2).
 * - `weekly`  — a target of N completions per calendar week (Sun-based).
 *
 * The three non-daily kinds are STRICT: a due day you don't complete counts as
 * a miss and breaks the streak (see lib/stats.ts computeScheduledStats).
 */
export type Schedule =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] } // 0=Sun..6=Sat, non-empty, sorted-unique
  | { kind: 'interval'; every: number } // every N days from start_date (N >= 1)
  | { kind: 'weekly'; count: number }; // N times per week (1..7)

export type ScheduleKind = Schedule['kind'];

export interface Habit {
  id: number;
  name: string;
  details: string;
  exceptions: string;
  kind: HabitKind; // 'build' | 'quit' — see HabitKind
  schedule: Schedule; // when it's expected — see Schedule (raw column is JSON-in-TEXT)
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
  /** Only present for `weekly` habits: this week's completions vs. target. */
  weekly?: WeeklyProgress;
}

/** Input accepted when creating/updating a habit. */
export interface HabitInput {
  name: string;
  details: string;
  exceptions: string;
  kind: HabitKind;
  schedule: Schedule;
  start_date: string;
}

/**
 * Weekly-count progress for the Today row of a `weekly` habit: how many
 * completions this calendar week vs the target. Undefined for other kinds.
 */
export interface WeeklyProgress {
  done: number;
  target: number;
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

/** Which built-in rep program a row/route/URL belongs to. */
export type RepProgramKey = 'pushups' | 'pullups';

/**
 * Static definition of one rep program. Powers both the two built-ins
 * (pushups/pullups, each its own table) and user-defined programs (which share
 * `rep_program_sessions`, scoped by `programId`). The engine (lib/repProgram.ts)
 * is identical for both; only the config differs.
 */
export interface RepProgramConfig {
  /** Filename-safe slug used as the media prefix: 'pushups' | 'pullups' | `rep<id>`. */
  key: string;
  table: string; // the sessions table for this program
  /** User-defined programs only: the rep_programs row id, scoping every query.
   *  Absent for the two built-ins (their tables have no program_id column). */
  programId?: number;
  label: string; // display name
  sets: number; // sets per day
  day1Total: number; // total reps on day 1
  programDays: number; // length of the ramp
  restSeconds: number; // rest between sets
  /** Human blurb for the finished state, e.g. "3 × 50". */
  finishLabel: string;
  /** API base for this program, e.g. '/api/pushups' or '/api/rep-programs/5'. */
  basePath: string;
  /** Screen path, e.g. '/pushups' or '/rep-programs/5'. */
  href: string;
}

/** A user-defined rep program — the configurable "template instance". */
export interface RepProgramRow {
  id: number;
  name: string;
  sets: number;
  day1_total: number;
  program_days: number;
  rest_seconds: number;
  sort_order: number;
  archived: number; // 0 | 1
  created_at: string;
}

/** Input accepted when creating/updating a user rep program. */
export interface RepProgramInput {
  name: string;
  sets: number;
  day1_total: number;
  program_days: number;
  rest_seconds: number;
}

/** One logged attempt at a program day (may or may not have completed it). */
export interface RepSession {
  id: number;
  date: string; // YYYY-MM-DD
  day_index: number; // program day this attempt targeted
  target: number[]; // [t1, t2, t3] prescribed reps
  reps: number[]; // [r1, r2, r3] actual reps done
  completed: boolean; // met target on every set
  /**
   * Optional single video of the whole workout (the guided one-take recording,
   * and legacy pre-per-set rows). Null when none is attached.
   */
  video: string | null;
  /**
   * Optional per-set videos, one slot per set (length === config.sets). Each
   * slot is a stored filename or null. Used by the manual "one video per set"
   * upload. Stored as JSON-in-TEXT (migration-fidelity), like target/reps.
   */
  videos: (string | null)[];
  created_at: string;
}

/** The computed state of a rep program — drives its card + Today summary. */
export interface RepProgramState {
  key: string; // filename-safe slug (see RepProgramConfig.key)
  basePath: string; // API base, e.g. '/api/pushups' or '/api/rep-programs/5'
  href: string; // screen path, e.g. '/pushups' or '/rep-programs/5'
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
