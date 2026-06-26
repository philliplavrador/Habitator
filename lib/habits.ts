import { db } from './db';
import type { Habit, HabitInput } from './types';

// ── Prepared statements (compiled once) ─────────────────────────────

const stmtListActive = db.prepare<[]>(
  `SELECT * FROM habits WHERE archived = 0 ORDER BY sort_order ASC, id ASC`
);
const stmtListAll = db.prepare<[]>(
  `SELECT * FROM habits ORDER BY archived ASC, sort_order ASC, id ASC`
);
const stmtGet = db.prepare<[number]>(`SELECT * FROM habits WHERE id = ?`);
const stmtMaxOrder = db.prepare<[]>(
  `SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM habits`
);
const stmtInsert = db.prepare(
  `INSERT INTO habits (name, details, exceptions, start_date, sort_order, archived, created_at)
   VALUES (@name, @details, @exceptions, @start_date, @sort_order, 0, @created_at)`
);
const stmtUpdate = db.prepare(
  `UPDATE habits SET name = @name, details = @details, exceptions = @exceptions,
   start_date = @start_date WHERE id = @id`
);
const stmtSetArchived = db.prepare<[number, number]>(
  `UPDATE habits SET archived = ? WHERE id = ?`
);
const stmtDelete = db.prepare<[number]>(`DELETE FROM habits WHERE id = ?`);

// ── Public API ──────────────────────────────────────────────────────

/** Active (non-archived) habits, in display order. */
export function listActiveHabits(): Habit[] {
  return stmtListActive.all() as Habit[];
}

/** Every habit, archived last. */
export function listAllHabits(): Habit[] {
  return stmtListAll.all() as Habit[];
}

export function getHabit(id: number): Habit | undefined {
  return stmtGet.get(id) as Habit | undefined;
}

/** Create a habit; appends to the end of the manual sort order. */
export function createHabit(input: HabitInput): Habit {
  const { maxOrder } = stmtMaxOrder.get() as { maxOrder: number };
  const info = stmtInsert.run({
    name: input.name,
    details: input.details,
    exceptions: input.exceptions,
    start_date: input.start_date,
    sort_order: maxOrder + 1,
    created_at: new Date().toISOString(),
  });
  return getHabit(Number(info.lastInsertRowid))!;
}

/** Update a habit's editable fields. Returns the fresh row, or undefined. */
export function updateHabit(id: number, input: HabitInput): Habit | undefined {
  const existing = getHabit(id);
  if (!existing) return undefined;
  stmtUpdate.run({
    id,
    name: input.name,
    details: input.details,
    exceptions: input.exceptions,
    start_date: input.start_date,
  });
  return getHabit(id);
}

/** Toggle archived flag (0/1). Returns the fresh row, or undefined. */
export function setHabitArchived(id: number, archived: boolean): Habit | undefined {
  const existing = getHabit(id);
  if (!existing) return undefined;
  stmtSetArchived.run(archived ? 1 : 0, id);
  return getHabit(id);
}

/** Delete a habit. Its entries cascade away via the FK. Returns true if removed. */
export function deleteHabit(id: number): boolean {
  const info = stmtDelete.run(id);
  return info.changes > 0;
}
