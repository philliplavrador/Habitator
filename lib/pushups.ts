// Pushup program — a 97-day ramp from 3×18 (54 total) to 3×50 (150 total),
// 90s rest between sets. Same engine as pullups (lib/repProgram.ts); this
// module just configures it.

import { createRepProgram } from './repProgram';
import type { RepProgramConfig, RepProgramState, RepSession } from './types';

export const PUSHUP_CONFIG: RepProgramConfig = {
  key: 'pushups',
  table: 'pushup_sessions',
  label: 'Pushups',
  sets: 3,
  day1Total: 54, // 18 × 3
  programDays: 97,
  restSeconds: 90,
  finishLabel: '3 × 50',
  basePath: '/api/pushups',
  href: '/pushups',
};

/** The configured pushup program instance (state + CRUD + video). */
export const pushupProgram = createRepProgram(PUSHUP_CONFIG);

export function listPushupSessions(userId: number): Promise<RepSession[]> {
  return pushupProgram.list(userId);
}
export function getPushupState(
  userId: number,
  tz: string
): Promise<RepProgramState> {
  return pushupProgram.getState(userId, tz);
}
