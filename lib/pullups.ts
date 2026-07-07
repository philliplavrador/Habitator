// Pullup program — a 46-day ramp from 3×5 (15 total) to 3×20 (60 total),
// 3 minutes (180s) rest between sets. Same engine as pushups; the only
// differences are the starting/ending totals, length, and rest.

import { createRepProgram } from './repProgram';
import type { RepProgramConfig, RepProgramState, RepSession } from './types';

export const PULLUP_CONFIG: RepProgramConfig = {
  key: 'pullups',
  table: 'pullup_sessions',
  label: 'Pullups',
  sets: 3,
  day1Total: 15, // 5 × 3
  programDays: 46, // day 46 → 60 total → 3 × 20
  restSeconds: 180, // 3 minutes
  finishLabel: '3 × 20',
  basePath: '/api/pullups',
  href: '/pullups',
};

/** The configured pullup program instance (state + CRUD + video). */
export const pullupProgram = createRepProgram(PULLUP_CONFIG);

export function listPullupSessions(userId: number): Promise<RepSession[]> {
  return pullupProgram.list(userId);
}
export function getPullupState(
  userId: number,
  tz: string
): Promise<RepProgramState> {
  return pullupProgram.getState(userId, tz);
}
