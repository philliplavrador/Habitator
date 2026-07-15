// Plank-program engine — the timed sibling of lib/repProgram.ts.
//
// One plank HOLD per day whose target duration ramps from `startSeconds` to
// `endSeconds` by `stepSeconds`. Like the rep engine, progression is driven
// purely by COUNT(completed = 1) rather than the calendar, which gives the same
// two guarantees for free:
//
//   • The day only advances when the hold meets its target, so a skipped day
//     (no row) OR a short hold (completed = 0) never advances the program.
//   • The "attempt streak" (lib/analytics.attemptStreak) counts consecutive days
//     with ANY logged session, so falling short keeps the streak while skipping a
//     whole day breaks it.
//
// Every method is scoped to a `userId` AND the program's row id. The sessions
// table is a single shared table (plank_program_sessions); `programId` is a
// validated INTEGER resolved server-side (lib/plankPrograms.resolveUserPlankProgram),
// so it's safe to inline into the SQL alongside the table name. All real values
// are bound parameters.
//
// SERVER-ONLY.

import { many, one, run } from './db';
import { nowISO, todayISO } from './dates';
import { attemptStreak } from './analytics';
import type {
  PlankProgramConfig,
  PlankProgramState,
  PlankSession,
} from './types';

/** The prescribed hold for a program day: start, +step/day, capped at end. */
export function plankTargetForDay(
  config: Pick<
    PlankProgramConfig,
    'startSeconds' | 'endSeconds' | 'stepSeconds' | 'programDays'
  >,
  day: number
): number {
  const d = Math.max(1, Math.min(config.programDays, Math.floor(day)));
  return Math.min(config.endSeconds, config.startSeconds + (d - 1) * config.stepSeconds);
}

export interface PlankProgram {
  readonly config: PlankProgramConfig;
  targetForDay(day: number): number;
  list(userId: number): Promise<PlankSession[]>;
  getState(userId: number, tz: string): Promise<PlankProgramState>;
  log(userId: number, lasted: number, tz: string): Promise<PlankProgramState>;
  get(userId: number, id: number): Promise<PlankSession | undefined>;
  update(
    userId: number,
    id: number,
    lasted: number
  ): Promise<PlankSession | undefined>;
  /** Delete a row; returns the removed row (so callers can clean up its video). */
  remove(userId: number, id: number): Promise<PlankSession | undefined>;
  setVideo(
    userId: number,
    id: number,
    filename: string
  ): Promise<PlankSession | undefined>;
  clearVideo(userId: number, id: number): Promise<PlankSession | undefined>;
}

export function createPlankProgram(config: PlankProgramConfig): PlankProgram {
  const t = 'plank_program_sessions'; // internal constant → safe to inline

  const pid = config.programId;
  if (!Number.isInteger(pid)) {
    throw new Error('plank program id must be an integer');
  }
  // Every query is scoped to this program's row id, exactly like the user rep
  // programs share rep_program_sessions. `pid` is a validated INTEGER, safe to
  // inline like the table name; all real values are bound parameters.
  const progFilter = ` AND program_id = ${pid}`;

  // `completed` is a 0/1 INTEGER (schema convention shared with the other
  // *_sessions tables); target/lasted are plain INTEGER seconds. hydrate mirrors
  // that: `completed === 1` back into a boolean, the durations straight through.
  function hydrate(row: unknown): PlankSession {
    const r = row as {
      id: number;
      date: string;
      day_index: number;
      target_seconds: number;
      lasted_seconds: number;
      completed: number;
      video: string | null;
      created_at: string;
    };
    return {
      id: r.id,
      date: r.date,
      day_index: r.day_index,
      target_seconds: r.target_seconds,
      lasted_seconds: r.lasted_seconds,
      completed: r.completed === 1,
      video: r.video ?? null,
      created_at: r.created_at,
    };
  }

  const forDay = (day: number) => plankTargetForDay(config, day);

  async function list(userId: number): Promise<PlankSession[]> {
    const rows = await many(
      `SELECT * FROM ${t} WHERE user_id = $1${progFilter} ORDER BY id DESC`,
      [userId]
    );
    return rows.map(hydrate);
  }

  async function getState(
    userId: number,
    tz: string
  ): Promise<PlankProgramState> {
    const today = todayISO(tz);

    // Four independent reads (none feeds another's query) — one wave. Mirrors the
    // rep engine: `done` is COUNT(completed = 1); `latest`/`todayDone` are LIMIT-1
    // lookups; `dateRows` is the DISTINCT-date scan feeding the attempt streak.
    const [doneRow, latest, todayDone, dateRows] = await Promise.all([
      one<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM ${t} WHERE user_id = $1 AND completed = 1${progFilter}`,
        [userId]
      ),
      one(
        `SELECT * FROM ${t} WHERE user_id = $1${progFilter} ORDER BY id DESC LIMIT 1`,
        [userId]
      ),
      one(
        `SELECT * FROM ${t} WHERE user_id = $1 AND completed = 1 AND date = $2${progFilter}
         ORDER BY id DESC LIMIT 1`,
        [userId, today]
      ),
      many<{ date: string }>(
        `SELECT DISTINCT date FROM ${t} WHERE user_id = $1${progFilter} ORDER BY date ASC`,
        [userId]
      ),
    ]);

    const done = doneRow?.c ?? 0;
    const programComplete = done >= config.programDays;
    const currentDay = Math.min(done + 1, config.programDays);
    // Clamp the DISPLAYED figures so "N of M" / daysLeft never read inconsistently
    // if an edit pushes the raw count past programDays; the raw count still drives
    // progression (so a delete correctly rolls back). Same guard as the rep engine.
    const displayDone = Math.min(done, config.programDays);
    const daysLeft = Math.max(0, config.programDays - done);

    const dates = dateRows.map((r) => r.date);
    const streak = attemptStreak(dates, today);

    return {
      key: config.key,
      basePath: config.basePath,
      href: config.href,
      label: config.label,
      startSeconds: config.startSeconds,
      endSeconds: config.endSeconds,
      stepSeconds: config.stepSeconds,
      programDays: config.programDays,
      finishLabel: config.finishLabel,
      completedCount: displayDone,
      currentDay,
      targetSeconds: forDay(currentDay),
      daysLeft,
      programComplete,
      doneToday: todayDone ? hydrate(todayDone) : null,
      lastAttempt: latest ? hydrate(latest) : null,
      currentStreak: streak.current,
      longestStreak: streak.longest,
    };
  }

  async function get(
    userId: number,
    id: number
  ): Promise<PlankSession | undefined> {
    const row = await one(
      `SELECT * FROM ${t} WHERE id = $1 AND user_id = $2${progFilter}`,
      [id, userId]
    );
    return row ? hydrate(row) : undefined;
  }

  async function log(
    userId: number,
    lasted: number,
    tz: string
  ): Promise<PlankProgramState> {
    const state = await getState(userId, tz);
    if (state.programComplete) return state;
    const target = forDay(state.currentDay);
    const completed = lasted >= target;
    await run(
      `INSERT INTO ${t} (program_id, user_id, date, day_index, target_seconds, lasted_seconds, completed, video, created_at)
       VALUES (${pid}, $1, $2, $3, $4, $5, $6, NULL, $7)`,
      [
        userId,
        todayISO(tz),
        state.currentDay,
        target,
        lasted,
        completed ? 1 : 0,
        nowISO(),
      ]
    );
    return getState(userId, tz);
  }

  // Update the actual hold and recompute `completed` from the row's FROZEN target;
  // day_index/target never change, keeping progression (a pure count of completed
  // rows) self-consistent when `completed` flips 1↔0.
  async function update(
    userId: number,
    id: number,
    lasted: number
  ): Promise<PlankSession | undefined> {
    const existing = await get(userId, id);
    if (!existing) return undefined;
    const completed = lasted >= existing.target_seconds;
    await run(
      `UPDATE ${t} SET lasted_seconds = $1, completed = $2 WHERE id = $3 AND user_id = $4${progFilter}`,
      [lasted, completed ? 1 : 0, id, userId]
    );
    return get(userId, id);
  }

  async function remove(
    userId: number,
    id: number
  ): Promise<PlankSession | undefined> {
    const existing = await get(userId, id);
    if (!existing) return undefined;
    await run(`DELETE FROM ${t} WHERE id = $1 AND user_id = $2${progFilter}`, [
      id,
      userId,
    ]);
    return existing;
  }

  async function setVideo(
    userId: number,
    id: number,
    filename: string
  ): Promise<PlankSession | undefined> {
    if (!(await get(userId, id))) return undefined;
    await run(
      `UPDATE ${t} SET video = $1 WHERE id = $2 AND user_id = $3${progFilter}`,
      [filename, id, userId]
    );
    return get(userId, id);
  }

  async function clearVideo(
    userId: number,
    id: number
  ): Promise<PlankSession | undefined> {
    if (!(await get(userId, id))) return undefined;
    await run(
      `UPDATE ${t} SET video = NULL WHERE id = $1 AND user_id = $2${progFilter}`,
      [id, userId]
    );
    return get(userId, id);
  }

  return {
    config,
    targetForDay: forDay,
    list,
    getState,
    log,
    get,
    update,
    remove,
    setVideo,
    clearVideo,
  };
}
