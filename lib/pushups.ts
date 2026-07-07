// Pushup program — a 97-day ramp from 3×18 (54 total) to 3×50 (150 total),
// 90s rest between sets. All behavior lives in the shared engine
// (lib/repProgram.ts); this module just configures it and re-exports the
// original helper names the rest of the app already imports.

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
};

/** The configured pushup program instance (state + CRUD + video). */
export const pushupProgram = createRepProgram(PUSHUP_CONFIG);

// ── Back-compat named helpers ───────────────────────────────────────
export const PROGRAM_DAYS = PUSHUP_CONFIG.programDays;
export const REST_SECONDS = PUSHUP_CONFIG.restSeconds;

export function targetForDay(day: number): number[] {
  return pushupProgram.targetForDay(day);
}
export function listPushupSessions(userId: number): Promise<RepSession[]> {
  return pushupProgram.list(userId);
}
export function getPushupState(
  userId: number,
  tz: string
): Promise<RepProgramState> {
  return pushupProgram.getState(userId, tz);
}
export function logPushupSession(
  userId: number,
  reps: number[],
  tz: string
): Promise<RepProgramState> {
  return pushupProgram.log(userId, reps, tz);
}
export function getPushupSession(
  userId: number,
  id: number
): Promise<RepSession | undefined> {
  return pushupProgram.get(userId, id);
}
export function updatePushupSession(
  userId: number,
  id: number,
  reps: number[]
): Promise<RepSession | undefined> {
  return pushupProgram.update(userId, id, reps);
}
