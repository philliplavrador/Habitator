// Daily tasks — one-off to-dos pinned to a calendar day.
//
// Deliberately NOT habits: a habit recurs on a schedule and feeds streaks; a
// task happens once. The one behaviour that makes them feel alive is CARRY-OVER
// — an unfinished task follows you to the next day instead of quietly being
// missed.
//
// Carry-over is a real write, not a display trick: {@link rollOverTasks} moves
// every open task with `date < today` onto today, stamping `carried_from` with
// the day it was FIRST planned for. Two reasons it's a write rather than a
// "date <= today" query:
//   1. a task then lives on exactly ONE day, so the chat agent's hand-written
//      `WHERE date = '...'` reads (lib/agent/chat.ts run_sql) are correct
//      without it having to know the roll-over rule, and
//   2. the day you look at is the day it's on — no row appears twice.
// It runs lazily on the first read of a day (page load / GET /api/tasks), so
// there's no cron to keep alive; `COALESCE(carried_from, date)` makes repeated
// rolls idempotent with respect to the original day.
//
// Every query is scoped to `userId`. SERVER-ONLY.

import { many, one, run } from './db';
import type { Task, TaskInput } from './types';

/**
 * Roll every unfinished task from before `today` onto `today`.
 *
 * Only reaches BACKWARD (`date < today`): a task the user deliberately parked on
 * a future day must stay there. Completed tasks never move — they stay pinned to
 * the day they were done, so a past day still shows what actually happened.
 *
 * Returns how many rows moved (callers ignore it; handy in tests/logs).
 */
export async function rollOverTasks(
  userId: number,
  today: string
): Promise<number> {
  return run(
    `UPDATE tasks
        SET date = $2,
            carried_from = COALESCE(carried_from, date)
      WHERE user_id = $1 AND done = 0 AND date < $2`,
    [userId, today]
  );
}

/**
 * The tasks sitting on one day, in board order: timed tasks first in clock
 * order, then untimed ones by their manual order. Done-ness isn't part of the
 * sort — the UI splits the list into open/done itself.
 */
export async function listTasksForDate(
  userId: number,
  date: string
): Promise<Task[]> {
  return many<Task>(
    `SELECT * FROM tasks
      WHERE user_id = $1 AND date = $2
      ORDER BY (at_time IS NULL), at_time ASC, sort_order ASC, id ASC`,
    [userId, date]
  );
}

/**
 * How many open tasks sit on each day in [start, end] — the dots the day picker
 * paints so you can see a busy day before navigating to it.
 */
export async function openTaskCountsByDate(
  userId: number,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const rows = await many<{ date: string; n: string }>(
    `SELECT date, COUNT(*) AS n FROM tasks
      WHERE user_id = $1 AND done = 0 AND date >= $2 AND date <= $3
      GROUP BY date`,
    [userId, start, end]
  );
  return new Map(rows.map((r) => [r.date, Number(r.n)]));
}

export async function getTask(
  userId: number,
  id: number
): Promise<Task | undefined> {
  return one<Task>(`SELECT * FROM tasks WHERE id = $1 AND user_id = $2`, [
    id,
    userId,
  ]);
}

/** Create a task; appends to the end of its day's manual order. */
export async function createTask(
  userId: number,
  input: TaskInput
): Promise<Task> {
  const row = await one<{ maxorder: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS maxorder
       FROM tasks WHERE user_id = $1 AND date = $2`,
    [userId, input.date]
  );
  const created = await one<Task>(
    `INSERT INTO tasks (user_id, title, notes, date, at_time, done, sort_order, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7) RETURNING *`,
    [
      userId,
      input.title,
      input.notes,
      input.date,
      input.at_time,
      (row?.maxorder ?? -1) + 1,
      new Date().toISOString(),
    ]
  );
  return created!;
}

/**
 * Edit a task's fields. Moving it to a different day resets `carried_from` to
 * NULL — the user has re-planned it on purpose, so it isn't "slipping" any more
 * and the carried-over chip would be a lie.
 */
export async function updateTask(
  userId: number,
  id: number,
  input: TaskInput
): Promise<Task | undefined> {
  const changed = await run(
    `UPDATE tasks
        SET title = $1, notes = $2, at_time = $3,
            date = $4,
            carried_from = CASE WHEN date = $4 THEN carried_from ELSE NULL END
      WHERE id = $5 AND user_id = $6`,
    [input.title, input.notes, input.at_time, input.date, id, userId]
  );
  if (changed === 0) return undefined;
  return getTask(userId, id);
}

/**
 * Check a task off (or un-check it).
 *
 * The task's `date` deliberately does NOT move: it stays on the day it was
 * sitting on, which is the day it shows up under. (It can't be stale — an open
 * task is rolled onto today before anyone can see it, so the only rows you can
 * check off are today's, a future day's you're getting ahead on, or one you just
 * un-checked.) `done_at` records when it actually happened; roll-over only ever
 * touches `done = 0` rows, so a completed task never drifts.
 */
export async function setTaskDone(
  userId: number,
  id: number,
  done: boolean
): Promise<Task | undefined> {
  const changed = await run(
    `UPDATE tasks SET done = $1, done_at = $2 WHERE id = $3 AND user_id = $4`,
    [done ? 1 : 0, done ? new Date().toISOString() : null, id, userId]
  );
  if (changed === 0) return undefined;
  return getTask(userId, id);
}

/** Delete a task. True if it was the user's and is gone. */
export async function deleteTask(userId: number, id: number): Promise<boolean> {
  return (
    (await run(`DELETE FROM tasks WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ])) > 0
  );
}
