import { hoursBetween } from './dates';
import type { Fast, FastStats } from './types';

/**
 * Summary stats over COMPLETED fasts (those with an end_at). An in-progress
 * fast has no final length, so it is excluded from every aggregate.
 *
 *  • totalFasts   = number of completed fasts
 *  • avgHours     = mean length of completed fasts; null when there are none
 *  • longestHours = length of the longest completed fast; null when none
 *  • totalHours   = summed length of completed fasts
 *  • goalsHit     = completed fasts whose length reached its goal_hours
 */
export function computeFastStats(fasts: Fast[]): FastStats {
  const completed = fasts.filter((f) => f.end_at !== null);

  let totalHours = 0;
  let longestHours: number | null = null;
  let goalsHit = 0;

  for (const f of completed) {
    const hours = hoursBetween(f.start_at, f.end_at as string);
    totalHours += hours;
    if (longestHours === null || hours > longestHours) longestHours = hours;
    if (hours >= f.goal_hours) goalsHit++;
  }

  const totalFasts = completed.length;

  return {
    totalFasts,
    avgHours: totalFasts === 0 ? null : totalHours / totalFasts,
    longestHours,
    totalHours,
    goalsHit,
  };
}
