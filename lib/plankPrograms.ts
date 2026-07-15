// User-defined plank programs — the store + config builder for the timed
// "template instances" (a hold-time ramp start→end by step). Mirrors
// lib/repPrograms.ts: a `plank_programs` row is one program's config; its
// sessions live in the shared `plank_program_sessions` table, scoped by
// `program_id`; the SAME engine (lib/plankProgram.ts) runs every program.
//
// SERVER-ONLY. Every query is scoped to `userId`.

import { many, one, run } from './db';
import { createPlankProgram, type PlankProgram } from './plankProgram';
import { formatHold, plankProgramDays } from './plankFormat';
import type {
  PlankProgramConfig,
  PlankProgramInput,
  PlankProgramRow,
  PlankProgramState,
} from './types';

/** Build the engine config for a plank program row (derives programDays + finish). */
export function configFromRow(row: PlankProgramRow): PlankProgramConfig {
  return {
    key: `plank${row.id}`, // filename-safe media prefix
    programId: row.id, // scopes every query to this program
    label: row.name,
    startSeconds: row.start_seconds,
    endSeconds: row.end_seconds,
    stepSeconds: row.step_seconds,
    programDays: plankProgramDays(
      row.start_seconds,
      row.end_seconds,
      row.step_seconds
    ),
    finishLabel: formatHold(row.end_seconds),
    basePath: `/api/plank-programs/${row.id}`,
    href: `/plank-programs/${row.id}`,
  };
}

/** A configured engine instance for a plank program row. */
export function programFromRow(row: PlankProgramRow): PlankProgram {
  return createPlankProgram(configFromRow(row));
}

/** Active (non-archived) programs, in display order. */
export function listPlankPrograms(userId: number): Promise<PlankProgramRow[]> {
  return many<PlankProgramRow>(
    `SELECT * FROM plank_programs WHERE user_id = $1 AND archived = 0
     ORDER BY sort_order ASC, id ASC`,
    [userId]
  );
}

export function getPlankProgram(
  userId: number,
  id: number
): Promise<PlankProgramRow | undefined> {
  return one<PlankProgramRow>(
    `SELECT * FROM plank_programs WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
}

/** Create a program; appends to the end of the manual sort order. */
export async function addPlankProgram(
  userId: number,
  input: PlankProgramInput
): Promise<PlankProgramRow> {
  const maxRow = await one<{ maxorder: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS maxorder FROM plank_programs WHERE user_id = $1`,
    [userId]
  );
  const created = await one<PlankProgramRow>(
    `INSERT INTO plank_programs
       (user_id, name, start_seconds, end_seconds, step_seconds, sort_order, archived, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7) RETURNING *`,
    [
      userId,
      input.name,
      input.start_seconds,
      input.end_seconds,
      input.step_seconds,
      (maxRow?.maxorder ?? -1) + 1,
      new Date().toISOString(),
    ]
  );
  return created!;
}

/**
 * Edit the program's `name`. The ramp params (start/end/step) are FROZEN after
 * creation — changing them would retroactively rewrite the target of every logged
 * session (each session stores its own target_seconds), corrupting the
 * completed-count progression. Delete + recreate to change the ramp.
 */
export async function editPlankProgram(
  userId: number,
  id: number,
  fields: { name: string }
): Promise<PlankProgramRow | undefined> {
  const changed = await run(
    `UPDATE plank_programs SET name = $1 WHERE id = $2 AND user_id = $3`,
    [fields.name, id, userId]
  );
  if (changed === 0) return undefined;
  return getPlankProgram(userId, id);
}

/** Delete a program; its sessions cascade away via the FK. True if removed. */
export async function removePlankProgram(
  userId: number,
  id: number
): Promise<boolean> {
  return (
    (await run(`DELETE FROM plank_programs WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])) > 0
  );
}

/**
 * Resolve a `[id]` route param to a configured engine instance for the current
 * user, or null (bad id / not theirs). This is the per-request program the
 * plank routes act on.
 */
export async function resolveUserPlankProgram(
  userId: number,
  idRaw: string
): Promise<PlankProgram | null> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = await getPlankProgram(userId, id);
  return row ? programFromRow(row) : null;
}

/** Computed state for every active program — for the Today summary widgets. */
export async function listPlankProgramStates(
  userId: number,
  tz: string
): Promise<PlankProgramState[]> {
  const rows = await listPlankPrograms(userId);
  // Each program's getState is independent — fan them out concurrently.
  // Promise.all preserves input order, so the returned array matches `rows`.
  return Promise.all(rows.map((row) => programFromRow(row).getState(userId, tz)));
}
