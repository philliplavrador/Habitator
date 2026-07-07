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

// Shared transport: one place for the JSON header, body encoding, and the
// `!res.ok → asError` contract. A JSON `Content-Type` (and JSON.stringify) is
// applied only for plain bodies; `FormData` is passed through untouched so the
// browser sets its own multipart boundary. Omit `body` for GET/DELETE.
async function request(
  url: string,
  method: string,
  body?: unknown
): Promise<Response> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, init);
  if (!res.ok) await asError(res);
  return res;
}

/** Read one envelope key (.habit/.fast/.state/…) off a JSON response. */
async function unwrap<T>(res: Response, key: string): Promise<T> {
  return (await res.json())[key] as T;
}

/** `request` + `unwrap`: the common JSON-in / `{ [key]: T }`-out call. */
async function requestJson<T>(
  url: string,
  method: string,
  key: string,
  body?: unknown
): Promise<T> {
  return unwrap<T>(await request(url, method, body), key);
}

/**
 * Upload a video by streaming its raw bytes as the PUT body (NOT multipart), so
 * the server can pipe them straight to disk without buffering the whole file.
 * The filename rides along as a `?name=` query param (for extension detection);
 * the browser sets Content-Type from the File/Blob. Returns the fresh `state`.
 */
async function putVideo(url: string, file: File): Promise<RepProgramState> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}name=${encodeURIComponent(file.name || 'video')}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) await asError(res);
  return unwrap<RepProgramState>(res, 'state');
}

export async function apiSetEntry(
  habitId: number,
  date: string,
  status: EntryStatus
): Promise<void> {
  await request('/api/entries', 'POST', { habitId, date, status });
}

export async function apiClearEntry(habitId: number, date: string): Promise<void> {
  await request(
    `/api/entries?habitId=${habitId}&date=${encodeURIComponent(date)}`,
    'DELETE'
  );
}

export async function apiCreateHabit(input: HabitInput): Promise<Habit> {
  return requestJson<Habit>('/api/habits', 'POST', 'habit', input);
}

export async function apiUpdateHabit(id: number, input: HabitInput): Promise<Habit> {
  return requestJson<Habit>(`/api/habits/${id}`, 'PATCH', 'habit', input);
}

export async function apiArchiveHabit(id: number, archived: boolean): Promise<void> {
  await request(`/api/habits/${id}`, 'PATCH', { archived });
}

export async function apiDeleteHabit(id: number): Promise<void> {
  await request(`/api/habits/${id}`, 'DELETE');
}

export async function apiLogout(): Promise<void> {
  await request('/api/logout', 'POST');
}

// ── Fasting ─────────────────────────────────────────────────────────

export async function apiStartFast(input: StartFastInput): Promise<Fast> {
  return requestJson<Fast>('/api/fasts', 'POST', 'fast', input);
}

export async function apiEndFast(id: number, endAt: string): Promise<Fast> {
  return apiUpdateFast(id, { end_at: endAt });
}

export async function apiUpdateFast(
  id: number,
  input: UpdateFastInput
): Promise<Fast> {
  return requestJson<Fast>(`/api/fasts/${id}`, 'PATCH', 'fast', input);
}

export async function apiDeleteFast(id: number): Promise<void> {
  await request(`/api/fasts/${id}`, 'DELETE');
}

// ── Rep programs (pushups / pullups) ────────────────────────────────
// All keyed by the program so the pushup and pullup screens share one client.

export async function apiLogReps(
  program: RepProgramKey,
  reps: number[]
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(`/api/${program}`, 'POST', 'state', { reps });
}

export async function apiUpdateReps(
  program: RepProgramKey,
  id: number,
  reps: number[]
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(
    `/api/${program}/${id}`,
    'PATCH',
    'state',
    { reps }
  );
}

export async function apiDeleteRepSession(
  program: RepProgramKey,
  id: number
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(`/api/${program}/${id}`, 'DELETE', 'state');
}

/** Attach or replace the whole-workout video on a session. Returns fresh state. */
export async function apiUploadRepVideo(
  program: RepProgramKey,
  id: number,
  file: File
): Promise<RepProgramState> {
  return putVideo(`/api/${program}/${id}/video`, file);
}

export async function apiDeleteRepVideo(
  program: RepProgramKey,
  id: number
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(
    `/api/${program}/${id}/video`,
    'DELETE',
    'state'
  );
}

/** Attach or replace one set's video (0-based index). Returns fresh state. */
export async function apiUploadRepSetVideo(
  program: RepProgramKey,
  id: number,
  set: number,
  file: File
): Promise<RepProgramState> {
  return putVideo(`/api/${program}/${id}/video/${set}`, file);
}

export async function apiDeleteRepSetVideo(
  program: RepProgramKey,
  id: number,
  set: number
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(
    `/api/${program}/${id}/video/${set}`,
    'DELETE',
    'state'
  );
}

// ── Anki — Core 2k/6k Japanese deck ─────────────────────────────────

/** Upsert one day's new-card count (date defaults to today server-side). */
export async function apiLogAnki(date: string, newCards: number): Promise<AnkiState> {
  return requestJson<AnkiState>('/api/anki', 'POST', 'state', {
    date,
    new_cards: newCards,
  });
}

export async function apiUpdateAnkiDay(id: number, newCards: number): Promise<AnkiState> {
  return requestJson<AnkiState>(`/api/anki/${id}`, 'PATCH', 'state', {
    new_cards: newCards,
  });
}

export async function apiDeleteAnkiDay(id: number): Promise<AnkiState> {
  return requestJson<AnkiState>(`/api/anki/${id}`, 'DELETE', 'state');
}
