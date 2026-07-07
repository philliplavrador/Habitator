// Shared bootstrap for the habit detail and edit pages. Both open by parsing the
// route `id` param (a positive integer, else 404), loading the user-scoped habit
// via getHabit, and 404ing when it's missing. `loadHabitOr404` collapses that
// copy-pasted preamble into one call. SERVER-ONLY: calls next/navigation's
// notFound() and the DB via lib/habits.

import { notFound } from 'next/navigation';
import { getHabit } from './habits';
import type { Habit } from './types';

/**
 * Parse `idParam` as a positive integer (404 otherwise), load the habit scoped
 * to `userId`, and 404 when it doesn't exist. Returns the habit on success.
 */
export async function loadHabitOr404(
  idParam: string,
  userId: number,
): Promise<Habit> {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const habit = await getHabit(userId, id);
  if (!habit) notFound();

  return habit;
}
