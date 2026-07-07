// Browser-side fetch helpers used by client components. Pure fetch — no server
// imports — so this is safe to bundle into the client.
import type {
  AnkiState,
  EntryStatus,
  Fast,
  Habit,
  HabitInput,
  RepProgramKey,
  RepProgramState,
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

// ── Rep programs (pushups / pullups) ────────────────────────────────
// All keyed by the program so the pushup and pullup screens share one client.

export async function apiLogReps(
  program: RepProgramKey,
  reps: number[]
): Promise<RepProgramState> {
  const res = await fetch(`/api/${program}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reps }),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).state as RepProgramState;
}

export async function apiUpdateReps(
  program: RepProgramKey,
  id: number,
  reps: number[]
): Promise<RepProgramState> {
  const res = await fetch(`/api/${program}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reps }),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).state as RepProgramState;
}

export async function apiDeleteRepSession(
  program: RepProgramKey,
  id: number
): Promise<RepProgramState> {
  const res = await fetch(`/api/${program}/${id}`, { method: 'DELETE' });
  if (!res.ok) await asError(res);
  return (await res.json()).state as RepProgramState;
}

/** Attach or replace the optional video on a session. Returns fresh state. */
export async function apiUploadRepVideo(
  program: RepProgramKey,
  id: number,
  file: File
): Promise<RepProgramState> {
  const fd = new FormData();
  fd.append('video', file);
  const res = await fetch(`/api/${program}/${id}/video`, {
    method: 'PUT',
    body: fd,
  });
  if (!res.ok) await asError(res);
  return (await res.json()).state as RepProgramState;
}

export async function apiDeleteRepVideo(
  program: RepProgramKey,
  id: number
): Promise<RepProgramState> {
  const res = await fetch(`/api/${program}/${id}/video`, { method: 'DELETE' });
  if (!res.ok) await asError(res);
  return (await res.json()).state as RepProgramState;
}

// ── Anki — Core 2k/6k Japanese deck ─────────────────────────────────

/** Upsert one day's new-card count (date defaults to today server-side). */
export async function apiLogAnki(date: string, newCards: number): Promise<AnkiState> {
  const res = await fetch('/api/anki', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, new_cards: newCards }),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).state as AnkiState;
}

export async function apiUpdateAnkiDay(id: number, newCards: number): Promise<AnkiState> {
  const res = await fetch(`/api/anki/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_cards: newCards }),
  });
  if (!res.ok) await asError(res);
  return (await res.json()).state as AnkiState;
}

export async function apiDeleteAnkiDay(id: number): Promise<AnkiState> {
  const res = await fetch(`/api/anki/${id}`, { method: 'DELETE' });
  if (!res.ok) await asError(res);
  return (await res.json()).state as AnkiState;
}
