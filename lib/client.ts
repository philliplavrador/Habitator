// Browser-side fetch helpers used by client components. Pure fetch — no server
// imports — so this is safe to bundle into the client.
import type {
  AnkiState,
  EntryStatus,
  Fast,
  Habit,
  HabitInput,
  PlankProgramInput,
  PlankProgramRow,
  PlankProgramState,
  RepProgramInput,
  RepProgramRow,
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
async function putVideo<T>(url: string, file: File): Promise<T> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}name=${encodeURIComponent(file.name || 'video')}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) await asError(res);
  return unwrap<T>(res, 'state');
}

/**
 * The affected habit's fresh state returned by an entry mutation, so the caller
 * can merge it into local state instead of triggering a full page refresh.
 * `currentStreak`/`weekly` may be absent from a clear when the habit wasn't
 * found server-side (deleted mid-flight) — the caller no-ops in that case.
 */
export interface EntryMutationResult {
  currentStreak?: number;
  weekly?: { done: number; target: number };
}

export async function apiSetEntry(
  habitId: number,
  date: string,
  status: EntryStatus
): Promise<EntryMutationResult> {
  const res = await request('/api/entries', 'POST', { habitId, date, status });
  const data = await res.json();
  return { currentStreak: data.currentStreak, weekly: data.weekly };
}

export async function apiClearEntry(
  habitId: number,
  date: string
): Promise<EntryMutationResult> {
  const res = await request(
    `/api/entries?habitId=${habitId}&date=${encodeURIComponent(date)}`,
    'DELETE'
  );
  const data = await res.json();
  return { currentStreak: data.currentStreak, weekly: data.weekly };
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

// ── Rep programs (pushups / pullups / user programs) ────────────────
// Keyed by the program's API base path (`state.basePath`), so the built-in and
// user-defined screens share one client. Examples: '/api/pushups' or
// '/api/rep-programs/5'.

export async function apiLogReps(
  basePath: string,
  reps: number[]
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(basePath, 'POST', 'state', { reps });
}

export async function apiUpdateReps(
  basePath: string,
  id: number,
  reps: number[]
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(
    `${basePath}/${id}`,
    'PATCH',
    'state',
    { reps }
  );
}

export async function apiDeleteRepSession(
  basePath: string,
  id: number
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(`${basePath}/${id}`, 'DELETE', 'state');
}

/** Attach or replace the whole-workout video on a session. Returns fresh state. */
export async function apiUploadRepVideo(
  basePath: string,
  id: number,
  file: File
): Promise<RepProgramState> {
  return putVideo<RepProgramState>(`${basePath}/${id}/video`, file);
}

export async function apiDeleteRepVideo(
  basePath: string,
  id: number
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(
    `${basePath}/${id}/video`,
    'DELETE',
    'state'
  );
}

/** Attach or replace one set's video (0-based index). Returns fresh state. */
export async function apiUploadRepSetVideo(
  basePath: string,
  id: number,
  set: number,
  file: File
): Promise<RepProgramState> {
  return putVideo<RepProgramState>(`${basePath}/${id}/video/${set}`, file);
}

export async function apiDeleteRepSetVideo(
  basePath: string,
  id: number,
  set: number
): Promise<RepProgramState> {
  return requestJson<RepProgramState>(
    `${basePath}/${id}/video/${set}`,
    'DELETE',
    'state'
  );
}

// ── User rep-program config (create / edit / delete the program itself) ──

export async function apiCreateRepProgram(
  input: RepProgramInput
): Promise<RepProgramRow> {
  return requestJson<RepProgramRow>('/api/rep-programs', 'POST', 'program', input);
}

export async function apiUpdateRepProgram(
  id: number,
  fields: { name: string; rest_seconds: number }
): Promise<RepProgramRow> {
  return requestJson<RepProgramRow>(
    `/api/rep-programs/${id}`,
    'PATCH',
    'program',
    fields
  );
}

export async function apiDeleteRepProgram(id: number): Promise<void> {
  await request(`/api/rep-programs/${id}`, 'DELETE');
}

// ── Plank programs (user programs) ──────────────────────────────────
// Keyed by the program's API base path (`state.basePath`), e.g.
// '/api/plank-programs/5'. A hold is a single duration in whole seconds.

export async function apiLogPlank(
  basePath: string,
  lasted: number
): Promise<PlankProgramState> {
  return requestJson<PlankProgramState>(basePath, 'POST', 'state', { lasted });
}

export async function apiUpdatePlankLasted(
  basePath: string,
  id: number,
  lasted: number
): Promise<PlankProgramState> {
  return requestJson<PlankProgramState>(
    `${basePath}/${id}`,
    'PATCH',
    'state',
    { lasted }
  );
}

export async function apiDeletePlankSession(
  basePath: string,
  id: number
): Promise<PlankProgramState> {
  return requestJson<PlankProgramState>(`${basePath}/${id}`, 'DELETE', 'state');
}

/** Attach or replace a plank session's video. Returns fresh state. */
export async function apiUploadPlankVideo(
  basePath: string,
  id: number,
  file: File
): Promise<PlankProgramState> {
  return putVideo<PlankProgramState>(`${basePath}/${id}/video`, file);
}

export async function apiDeletePlankVideo(
  basePath: string,
  id: number
): Promise<PlankProgramState> {
  return requestJson<PlankProgramState>(
    `${basePath}/${id}/video`,
    'DELETE',
    'state'
  );
}

// ── Plank-program config (create / edit / delete the program itself) ──

export async function apiCreatePlankProgram(
  input: PlankProgramInput
): Promise<PlankProgramRow> {
  return requestJson<PlankProgramRow>(
    '/api/plank-programs',
    'POST',
    'program',
    input
  );
}

export async function apiUpdatePlankProgram(
  id: number,
  fields: { name: string }
): Promise<PlankProgramRow> {
  return requestJson<PlankProgramRow>(
    `/api/plank-programs/${id}`,
    'PATCH',
    'program',
    fields
  );
}

export async function apiDeletePlankProgram(id: number): Promise<void> {
  await request(`/api/plank-programs/${id}`, 'DELETE');
}

// ── Custom-habit domains (pushups / pullups / japanese) ─────────────

/** Opt into a built-in custom habit. Idempotent server-side. */
export async function apiAddDomain(domain: string): Promise<void> {
  await request('/api/domains', 'POST', { domain });
}

/**
 * Delete a Today-screen custom habit by its DELETE endpoint — `/api/domains/
 * pushups` for a built-in domain, `/api/rep-programs/5` for a user program.
 * Both drop the habit and everything logged in it.
 */
export async function apiDeleteCustomHabit(endpoint: string): Promise<void> {
  await request(endpoint, 'DELETE');
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
