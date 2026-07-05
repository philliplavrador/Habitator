import { db } from './db';
import { nowISO, todayISO } from './dates';
import type { PushupSession, PushupState } from './types';

// ── Program definition ──────────────────────────────────────────────
//
// A 97-day progression. Every day is 3 sets with 90s rest between them; the
// total reps grow by 1 each day and are spread as evenly as possible across
// the sets, filling from set 1. Day 1 = 18·18·18 (total 54), Day 97 = 50·50·50
// (total 150). Progression is by *completed session*, not calendar day: you
// only move to the next day once you hit every set's target.

export const PROGRAM_DAYS = 97;
export const REST_SECONDS = 90;
const SETS = 3;
const DAY1_TOTAL = 54; // 18 × 3

/** The prescribed [set1, set2, set3] reps for a program day (1..97). */
export function targetForDay(day: number): number[] {
  const d = Math.max(1, Math.min(PROGRAM_DAYS, Math.floor(day)));
  const total = DAY1_TOTAL + (d - 1); // day 1 → 54, day 97 → 150
  const base = Math.floor(total / SETS);
  const rem = total % SETS; // 0, 1, or 2 sets get the extra rep
  return [base + (rem >= 1 ? 1 : 0), base + (rem >= 2 ? 1 : 0), base];
}

/** A session completes a day when actual reps meet the target on EVERY set. */
export function isComplete(target: number[], reps: number[]): boolean {
  return target.every((t, i) => (reps[i] ?? 0) >= t);
}

// ── Prepared statements ─────────────────────────────────────────────

const stmtCompletedCount = db.prepare<[]>(
  `SELECT COUNT(*) AS c FROM pushup_sessions WHERE completed = 1`
);
const stmtLatest = db.prepare<[]>(
  `SELECT * FROM pushup_sessions ORDER BY id DESC LIMIT 1`
);
const stmtDoneToday = db.prepare<[string]>(
  `SELECT * FROM pushup_sessions WHERE completed = 1 AND date = ? ORDER BY id DESC LIMIT 1`
);
const stmtList = db.prepare<[]>(
  `SELECT * FROM pushup_sessions ORDER BY id DESC`
);
const stmtInsert = db.prepare(
  `INSERT INTO pushup_sessions (date, day_index, target, reps, completed, created_at)
   VALUES (@date, @day_index, @target, @reps, @completed, @created_at)`
);

// Rows store target/reps as JSON text; hydrate to the domain shape.
function hydrate(row: unknown): PushupSession {
  const r = row as {
    id: number;
    date: string;
    day_index: number;
    target: string;
    reps: string;
    completed: number;
    created_at: string;
  };
  return {
    id: r.id,
    date: r.date,
    day_index: r.day_index,
    target: JSON.parse(r.target) as number[],
    reps: JSON.parse(r.reps) as number[],
    completed: r.completed === 1,
    created_at: r.created_at,
  };
}

// ── Public API ──────────────────────────────────────────────────────

function completedCount(): number {
  return (stmtCompletedCount.get() as { c: number }).c;
}

/** Every session, newest first. */
export function listPushupSessions(): PushupSession[] {
  return (stmtList.all() as unknown[]).map(hydrate);
}

/** The full computed program state used by the Today-screen card. */
export function getPushupState(tz: string): PushupState {
  const done = completedCount();
  const programComplete = done >= PROGRAM_DAYS;
  const currentDay = Math.min(done + 1, PROGRAM_DAYS);
  const latest = stmtLatest.get();
  const todayDone = stmtDoneToday.get(todayISO(tz));

  return {
    programDays: PROGRAM_DAYS,
    restSeconds: REST_SECONDS,
    completedCount: done,
    currentDay,
    target: targetForDay(currentDay),
    daysLeft: PROGRAM_DAYS - done,
    programComplete,
    doneToday: todayDone ? hydrate(todayDone) : null,
    lastAttempt: latest ? hydrate(latest) : null,
  };
}

/**
 * Log an attempt at the current day with the given actual reps. Advances the
 * program only if the reps hit the target on every set. Returns the fresh
 * state. No-op state (unchanged) if the program is already complete.
 */
export function logPushupSession(reps: number[], tz: string): PushupState {
  const state = getPushupState(tz);
  if (state.programComplete) return state;

  const target = targetForDay(state.currentDay);
  const completed = isComplete(target, reps);
  stmtInsert.run({
    date: todayISO(tz),
    day_index: state.currentDay,
    target: JSON.stringify(target),
    reps: JSON.stringify(reps.slice(0, SETS)),
    completed: completed ? 1 : 0,
    created_at: nowISO(),
  });
  return getPushupState(tz);
}
