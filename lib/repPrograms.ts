// User-defined rep programs — the store + config builder for the configurable
// "template instances" that generalize the two built-ins (pushups/pullups).
//
// A `rep_programs` row is one program's config. Its sessions live in the shared
// `rep_program_sessions` table, scoped by `program_id`. The SAME engine
// (lib/repProgram.ts) runs a user program as it does the built-ins — only the
// config differs (table + programId + basePath/href) — so every screen, route,
// and chart is reused.
//
// SERVER-ONLY. Every query is scoped to `userId`.

import { many, one, run } from './db';
import { createRepProgram, targetForDay, type RepProgram } from './repProgram';
import type {
  RepProgramConfig,
  RepProgramInput,
  RepProgramRow,
  RepProgramState,
} from './types';

/** Build the engine config for a user program row (derives finishLabel). */
export function configFromRow(row: RepProgramRow): RepProgramConfig {
  const base: RepProgramConfig = {
    key: `rep${row.id}`, // filename-safe media prefix
    table: 'rep_program_sessions',
    programId: row.id, // scopes every query to this program
    label: row.name,
    sets: row.sets,
    day1Total: row.day1_total,
    programDays: row.program_days,
    restSeconds: row.rest_seconds,
    finishLabel: '', // filled below
    basePath: `/api/rep-programs/${row.id}`,
    href: `/rep-programs/${row.id}`,
  };
  const finalTarget = targetForDay(base, row.program_days);
  base.finishLabel = finalTarget.every((x) => x === finalTarget[0])
    ? `${row.sets} × ${finalTarget[0]}`
    : finalTarget.join(' · ');
  return base;
}

/** A configured engine instance for a user program row. */
export function programFromRow(row: RepProgramRow): RepProgram {
  return createRepProgram(configFromRow(row));
}

/** Active (non-archived) programs, in display order. */
export function listRepPrograms(userId: number): Promise<RepProgramRow[]> {
  return many<RepProgramRow>(
    `SELECT * FROM rep_programs WHERE user_id = $1 AND archived = 0
     ORDER BY sort_order ASC, id ASC`,
    [userId]
  );
}

export function getRepProgram(
  userId: number,
  id: number
): Promise<RepProgramRow | undefined> {
  return one<RepProgramRow>(
    `SELECT * FROM rep_programs WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

/** Create a program; appends to the end of the manual sort order. */
export async function addRepProgram(
  userId: number,
  input: RepProgramInput
): Promise<RepProgramRow> {
  const maxRow = await one<{ maxorder: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS maxorder FROM rep_programs WHERE user_id = $1`,
    [userId]
  );
  const created = await one<RepProgramRow>(
    `INSERT INTO rep_programs
       (user_id, name, sets, day1_total, program_days, rest_seconds, sort_order, archived, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8) RETURNING *`,
    [
      userId,
      input.name,
      input.sets,
      input.day1_total,
      input.program_days,
      input.rest_seconds,
      (maxRow?.maxorder ?? -1) + 1,
      new Date().toISOString(),
    ]
  );
  return created!;
}

/**
 * Edit the cosmetic/behavioral fields of a program: `name` and `rest_seconds`.
 * The ramp params (sets / day1_total / program_days) are FROZEN after creation —
 * changing them would retroactively rewrite the target of every logged session
 * (each session stores its own target array), corrupting the completed-count
 * progression. Delete + recreate to change the ramp.
 */
export async function editRepProgram(
  userId: number,
  id: number,
  fields: { name: string; rest_seconds: number }
): Promise<RepProgramRow | undefined> {
  const changed = await run(
    `UPDATE rep_programs SET name = $1, rest_seconds = $2 WHERE id = $3 AND user_id = $4`,
    [fields.name, fields.rest_seconds, id, userId]
  );
  if (changed === 0) return undefined;
  return getRepProgram(userId, id);
}

/** Delete a program; its sessions cascade away via the FK. True if removed. */
export async function removeRepProgram(
  userId: number,
  id: number
): Promise<boolean> {
  return (
    (await run(`DELETE FROM rep_programs WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])) > 0
  );
}

/**
 * Resolve a `[id]` route param to a configured engine instance for the current
 * user, or null (bad id / not theirs). This is the per-request program the
 * generic rep routes act on.
 */
export async function resolveUserProgram(
  userId: number,
  idRaw: string
): Promise<RepProgram | null> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = await getRepProgram(userId, id);
  return row ? programFromRow(row) : null;
}

/** Computed state for every active program — for the Today summary widgets. */
export async function listRepProgramStates(
  userId: number,
  tz: string
): Promise<RepProgramState[]> {
  const rows = await listRepPrograms(userId);
  const states: RepProgramState[] = [];
  for (const row of rows) {
    states.push(await programFromRow(row).getState(userId, tz));
  }
  return states;
}
