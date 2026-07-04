// Browser-side fetch helpers used by client components. Pure fetch — no server
// imports — so this is safe to bundle into the client.
import type {
  EntryStatus,
  Fast,
  Habit,
  HabitInput,
  StartFastInput,
  UpdateFastInput,
} from './types';

async function asError(res: Response): Promise<never> {
  let message = `Request failed (${res.status}).`;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {
    /* keep default */
  }
  throw new Error(message);
}

export async function apiSetEntry(
  habitId: number,
  date: string,
  status: EntryStatus
): Promise<void> {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ habitId, date, status }),
  });
  if (!res.ok) await asError(res);
}

export async function apiClearEntry(habitId: number, date: string): Promise<void> {
  const res = await fetch(
    `/api/entries?habitId=${habitId}&date=${encodeURIComponent(date)}`,
    { method: 'DELETE' }
  );
  if (!res.ok) await asError(res);
}

export async function apiCreateHabit(input: HabitInput): Promise<Habit> {
  const res = await fetch('/api/habits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).habit as Habit;
}

export async function apiUpdateHabit(id: number, input: HabitInput): Promise<Habit> {
  const res = await fetch(`/api/habits/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).habit as Habit;
}

export async function apiArchiveHabit(id: number, archived: boolean): Promise<void> {
  const res = await fetch(`/api/habits/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) await asError(res);
}

export async function apiDeleteHabit(id: number): Promise<void> {
  const res = await fetch(`/api/habits/${id}`, { method: 'DELETE' });
  if (!res.ok) await asError(res);
}

export async function apiLogout(): Promise<void> {
  const res = await fetch('/api/logout', { method: 'POST' });
  if (!res.ok) await asError(res);
}

// ── Fasting ─────────────────────────────────────────────────────────

export async function apiStartFast(input: StartFastInput): Promise<Fast> {
  const res = await fetch('/api/fasts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).fast as Fast;
}

export async function apiEndFast(id: number, endAt: string): Promise<Fast> {
  return apiUpdateFast(id, { end_at: endAt });
}

export async function apiUpdateFast(
  id: number,
  input: UpdateFastInput
): Promise<Fast> {
  const res = await fetch(`/api/fasts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).fast as Fast;
}

export async function apiDeleteFast(id: number): Promise<void> {
  const res = await fetch(`/api/fasts/${id}`, { method: 'DELETE' });
  if (!res.ok) await asError(res);
}
