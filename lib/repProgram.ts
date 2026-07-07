// Generic "rep program" engine shared by pushups and pullups.
//
// Both programs are identical in shape — 3 sets a day, each attempt stores a
// JSON [target, reps] pair, and progression is driven purely by
// COUNT(completed = 1) rather than the calendar. That last property is what
// gives the two required guarantees for free:
//
//   • The day only advances when every set hits its target, so a skipped day
//     (no row) OR a short attempt (completed = 0) never adds a rep.
//   • The "attempt streak" is a separate notion (see lib/analytics.attemptStreak):
//     it counts consecutive days with ANY logged session, so falling short keeps
//     the streak while skipping a whole day breaks it.
//
// Every method is scoped to a `userId`, so the two accounts' programs progress
// independently. The table name comes from the (internal, non-user) config, so
// it's safe to inline into the SQL; all real values are bound parameters.

import { many, one, run, tx } from './db';
import { nowISO, todayISO } from './dates';
import { attemptStreak } from './analytics';
import type { RepProgramConfig, RepProgramState, RepSession } from './types';

/** The prescribed reps for a program day: total grows by 1/day, spread evenly
 *  across the sets, filling from set 1 (so exactly one set gains a rep daily). */
export function targetForDay(config: RepProgramConfig, day: number): number[] {
  const d = Math.max(1, Math.min(config.programDays, Math.floor(day)));
  const total = config.day1Total + (d - 1);
  const base = Math.floor(total / config.sets);
  const rem = total % config.sets; // the first `rem` sets get the extra rep
  return Array.from({ length: config.sets }, (_, i) => base + (rem > i ? 1 : 0));
}

/** A session completes a day when actual reps meet the target on EVERY set. */
export function isComplete(target: number[], reps: number[]): boolean {
  return target.every((t, i) => (reps[i] ?? 0) >= t);
}

export interface RepProgram {
  readonly config: RepProgramConfig;
  targetForDay(day: number): number[];
  list(userId: number): Promise<RepSession[]>;
  getState(userId: number, tz: string): Promise<RepProgramState>;
  log(userId: number, reps: number[], tz: string): Promise<RepProgramState>;
  get(userId: number, id: number): Promise<RepSession | undefined>;
  update(
    userId: number,
    id: number,
    reps: number[]
  ): Promise<RepSession | undefined>;
  /** Delete a row; returns the removed row (so callers can clean up its videos). */
  remove(userId: number, id: number): Promise<RepSession | undefined>;
  /** Set/replace the whole-workout video (the single `video` column). */
  setVideo(
    userId: number,
    id: number,
    filename: string
  ): Promise<RepSession | undefined>;
  clearVideo(userId: number, id: number): Promise<RepSession | undefined>;
  /** Set/replace the video for one set (0-based; caller validates the range). */
  setSetVideo(
    userId: number,
    id: number,
    set: number,
    filename: string
  ): Promise<RepSession | undefined>;
  clearSetVideo(
    userId: number,
    id: number,
    set: number
  ): Promise<RepSession | undefined>;
}

export function createRepProgram(config: RepProgramConfig): RepProgram {
  const t = config.table; // internal constant, never user input → safe to inline

  // User-defined programs share `rep_program_sessions`, so every query is
  // additionally scoped to the program's row id. `programId` is a validated
  // INTEGER resolved server-side (see lib/repPrograms.resolveUserProgram) — safe
  // to inline like the table name. For the two built-ins it's absent, so
  // `progFilter` is '' and their SQL stays byte-identical to before.
  const pid = config.programId;
  if (pid != null && !Number.isInteger(pid)) {
    throw new Error('rep program id must be an integer');
  }
  const progFilter = pid != null ? ` AND program_id = ${pid}` : '';
  const progInsertCol = pid != null ? 'program_id, ' : '';
  const progInsertVal = pid != null ? `${pid}, ` : '';

  // Rows store target/reps as JSON text and `completed` as a 0/1 INTEGER — these
  // shapes are the MIGRATION-FIDELITY invariant (see lib/db.ts SCHEMA notes):
  // SQLite rows copy across verbatim, so hydrate MUST mirror them exactly —
  // JSON.parse(target)/JSON.parse(reps) back into number[], and `completed === 1`
  // back into a boolean. Don't "modernize" these columns to jsonb/boolean without
  // migrating existing rows; the raw 0/1 also feeds the COUNT(completed = 1)
  // progression queries below.
  function hydrate(row: unknown): RepSession {
    const r = row as {
      id: number;
      date: string;
      day_index: number;
      target: string;
      reps: string;
      completed: number;
      video: string | null;
      videos: string | null;
      created_at: string;
    };
    return {
      id: r.id,
      date: r.date,
      day_index: r.day_index,
      target: JSON.parse(r.target) as number[],
      reps: JSON.parse(r.reps) as number[],
      completed: r.completed === 1,
      video: r.video ?? null,
      videos: hydrateSetVideos(r.videos),
      created_at: r.created_at,
    };
  }

  // Per-set videos are JSON-in-TEXT (like target/reps) — a nullable filename per
  // set. NULL/absent/garbage all normalize to a full-length array of nulls so
  // callers can always index `videos[set]` for 0..sets-1.
  function hydrateSetVideos(raw: string | null): (string | null)[] {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const arr = Array.isArray(parsed) ? parsed : [];
    return Array.from({ length: config.sets }, (_, i) =>
      typeof arr[i] === 'string' ? (arr[i] as string) : null
    );
  }

  const forDay = (day: number) => targetForDay(config, day);

  async function list(userId: number): Promise<RepSession[]> {
    const rows = await many(
      `SELECT * FROM ${t} WHERE user_id = $1${progFilter} ORDER BY id DESC`,
      [userId]
    );
    return rows.map(hydrate);
  }

  async function getState(
    userId: number,
    tz: string
  ): Promise<RepProgramState> {
    const doneRow = await one<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM ${t} WHERE user_id = $1 AND completed = 1${progFilter}`,
      [userId]
    );
    const done = doneRow?.c ?? 0;
    const programComplete = done >= config.programDays;
    const currentDay = Math.min(done + 1, config.programDays);
    // Editing a leftover short attempt up to its target after the program is
    // already complete can push COUNT(completed) past programDays. Clamp the
    // *displayed* figures so "N of M" and daysLeft never read inconsistently;
    // the raw count still drives progression (so a delete correctly rolls back).
    const displayDone = Math.min(done, config.programDays);
    const daysLeft = Math.max(0, config.programDays - done);
    const today = todayISO(tz);

    const latest = await one(
      `SELECT * FROM ${t} WHERE user_id = $1${progFilter} ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    const todayDone = await one(
      `SELECT * FROM ${t} WHERE user_id = $1 AND completed = 1 AND date = $2${progFilter}
       ORDER BY id DESC LIMIT 1`,
      [userId, today]
    );
    const dates = (
      await many<{ date: string }>(
        `SELECT DISTINCT date FROM ${t} WHERE user_id = $1${progFilter} ORDER BY date ASC`,
        [userId]
      )
    ).map((r) => r.date);
    const streak = attemptStreak(dates, today);

    return {
      key: config.key,
      basePath: config.basePath,
      href: config.href,
      label: config.label,
      programDays: config.programDays,
      restSeconds: config.restSeconds,
      sets: config.sets,
      finishLabel: config.finishLabel,
      completedCount: displayDone,
      currentDay,
      target: forDay(currentDay),
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
  ): Promise<RepSession | undefined> {
    const row = await one(
      `SELECT * FROM ${t} WHERE id = $1 AND user_id = $2${progFilter}`,
      [id, userId]
    );
    return row ? hydrate(row) : undefined;
  }

  async function log(
    userId: number,
    reps: number[],
    tz: string
  ): Promise<RepProgramState> {
    const state = await getState(userId, tz);
    if (state.programComplete) return state;
    const target = forDay(state.currentDay);
    const completed = isComplete(target, reps);
    await run(
      `INSERT INTO ${t} (${progInsertCol}user_id, date, day_index, target, reps, completed, video, created_at)
       VALUES (${progInsertVal}$1, $2, $3, $4, $5, $6, NULL, $7)`,
      [
        userId,
        todayISO(tz),
        state.currentDay,
        JSON.stringify(target),
        JSON.stringify(reps.slice(0, config.sets)),
        completed ? 1 : 0,
        nowISO(),
      ]
    );
    return getState(userId, tz);
  }

  // Update actual reps and recompute `completed` from the row's FROZEN target;
  // day_index/target never change, keeping progression (a pure count of
  // completed rows) self-consistent when `completed` flips 1↔0.
  async function update(
    userId: number,
    id: number,
    reps: number[]
  ): Promise<RepSession | undefined> {
    const existing = await get(userId, id);
    if (!existing) return undefined;
    const completed = isComplete(existing.target, reps);
    await run(
      `UPDATE ${t} SET reps = $1, completed = $2 WHERE id = $3 AND user_id = $4${progFilter}`,
      [JSON.stringify(reps.slice(0, config.sets)), completed ? 1 : 0, id, userId]
    );
    return get(userId, id);
  }

  async function remove(
    userId: number,
    id: number
  ): Promise<RepSession | undefined> {
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
  ): Promise<RepSession | undefined> {
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
  ): Promise<RepSession | undefined> {
    if (!(await get(userId, id))) return undefined;
    await run(
      `UPDATE ${t} SET video = NULL WHERE id = $1 AND user_id = $2${progFilter}`,
      [id, userId]
    );
    return get(userId, id);
  }

  // Per-set videos share ONE JSON array column, so setting/clearing a single
  // slot is a read-modify-write of the whole array. That must be atomic per row:
  // do the SELECT … FOR UPDATE + UPDATE inside one transaction so two concurrent
  // per-set writes (e.g. the owner uploading Set 1 on their phone and Set 2 on
  // desktop) can't both read the same array and clobber each other's slot (which
  // would drop one filename from the DB and orphan its file). The lock serializes
  // them; the second write sees the first's committed array.
  async function writeSetVideo(
    userId: number,
    id: number,
    set: number,
    filename: string | null
  ): Promise<RepSession | undefined> {
    if (set < 0 || set >= config.sets) return undefined;
    return tx(async (client) => {
      const locked = await client.query(
        `SELECT * FROM ${t} WHERE id = $1 AND user_id = $2${progFilter} FOR UPDATE`,
        [id, userId]
      );
      if (locked.rows.length === 0) return undefined;
      const videos = [...hydrate(locked.rows[0]).videos];
      videos[set] = filename;
      const updated = await client.query(
        `UPDATE ${t} SET videos = $1 WHERE id = $2 AND user_id = $3${progFilter} RETURNING *`,
        [JSON.stringify(videos), id, userId]
      );
      return hydrate(updated.rows[0]);
    });
  }

  const setSetVideo = (
    userId: number,
    id: number,
    set: number,
    filename: string
  ) => writeSetVideo(userId, id, set, filename);
  const clearSetVideo = (userId: number, id: number, set: number) =>
    writeSetVideo(userId, id, set, null);

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
    setSetVideo,
    clearSetVideo,
  };
}
