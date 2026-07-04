import {
  hoursBetween,
  isValidISODate,
  isValidTimestamp,
  nowISO,
  todayISO,
} from './dates';
import type { HabitInput, StartFastInput, UpdateFastInput } from './types';

// Sane bounds for a fasting goal, in hours. Rejects fat-finger inputs while
// still allowing extended multi-day fasts (168h = one week).
const MIN_GOAL_HOURS = 1;
const MAX_GOAL_HOURS = 168;
const MAX_NOTE_LEN = 1000;

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Validate/normalize a habit create/update payload.
 * - name is required (trimmed, non-empty, capped length)
 * - details/exceptions default to ''
 * - start_date defaults to today; must be a valid YYYY-MM-DD
 */
export function parseHabitInput(body: unknown): ParseResult<HabitInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Expected a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  const name = asString(b.name).trim();
  if (name.length === 0) return { ok: false, error: 'Name is required.' };
  if (name.length > 200) return { ok: false, error: 'Name is too long.' };

  const details = asString(b.details).trim();
  const exceptions = asString(b.exceptions).trim();

  const rawStart = asString(b.start_date).trim();
  const start_date = rawStart === '' ? todayISO() : rawStart;
  if (!isValidISODate(start_date)) {
    return { ok: false, error: 'start_date must be a valid YYYY-MM-DD date.' };
  }

  return { ok: true, value: { name, details, exceptions, start_date } };
}

// ── Fasting ─────────────────────────────────────────────────────────

function parseGoalHours(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_GOAL_HOURS || n > MAX_GOAL_HOURS) return null;
  return n;
}

const windowError = `A fast must be between ${MIN_GOAL_HOURS} and ${MAX_GOAL_HOURS} hours long.`;

/**
 * Validate/normalize the payload to CREATE a fast. Two shapes:
 * - Live fast: `goal_hours` (target window length) required; `end_at` omitted.
 * - Logged fast: `end_at` present (an already-finished fast); the goal is
 *   derived from the start→end window.
 * `start_at` defaults to now; `note` defaults to ''.
 */
export function parseStartFastInput(body: unknown): ParseResult<StartFastInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Expected a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  const rawStart = asString(b.start_at).trim();
  const start_at = rawStart === '' ? nowISO() : rawStart;
  if (!isValidTimestamp(start_at)) {
    return { ok: false, error: 'start_at must be a valid timestamp.' };
  }

  const note = asString(b.note).trim();
  if (note.length > MAX_NOTE_LEN) {
    return { ok: false, error: 'Note is too long.' };
  }

  // A concrete end_at means we're logging a completed fast; the goal is the
  // length of the recorded window.
  const hasEnd =
    b.end_at !== null && b.end_at !== undefined && asString(b.end_at).trim() !== '';
  if (hasEnd) {
    const end_at = asString(b.end_at).trim();
    if (!isValidTimestamp(end_at)) {
      return { ok: false, error: 'end_at must be a valid timestamp.' };
    }
    const duration = hoursBetween(start_at, end_at);
    if (duration <= 0) {
      return { ok: false, error: 'The end must be after the start.' };
    }
    if (duration < MIN_GOAL_HOURS || duration > MAX_GOAL_HOURS) {
      return { ok: false, error: windowError };
    }
    return { ok: true, value: { start_at, end_at, goal_hours: duration, note } };
  }

  // No end_at → a live fast; require a valid target window length.
  const goal_hours = parseGoalHours(b.goal_hours);
  if (goal_hours === null) {
    return { ok: false, error: windowError };
  }
  return { ok: true, value: { start_at, goal_hours, note } };
}

/**
 * Validate/normalize a partial UPDATE to a fast (end it, or edit fields).
 * Every field is optional, but at least one must be present. `end_at: null`
 * explicitly re-opens a fast; omitting it leaves the field unchanged.
 */
export function parseUpdateFastInput(body: unknown): ParseResult<UpdateFastInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Expected a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  const out: UpdateFastInput = {};

  if ('goal_hours' in b) {
    const goal_hours = parseGoalHours(b.goal_hours);
    if (goal_hours === null) {
      return {
        ok: false,
        error: `goal_hours must be a number between ${MIN_GOAL_HOURS} and ${MAX_GOAL_HOURS}.`,
      };
    }
    out.goal_hours = goal_hours;
  }

  if ('start_at' in b) {
    const start_at = asString(b.start_at).trim();
    if (!isValidTimestamp(start_at)) {
      return { ok: false, error: 'start_at must be a valid timestamp.' };
    }
    out.start_at = start_at;
  }

  if ('end_at' in b) {
    if (b.end_at === null) {
      out.end_at = null;
    } else {
      const end_at = asString(b.end_at).trim();
      if (!isValidTimestamp(end_at)) {
        return { ok: false, error: 'end_at must be a valid timestamp or null.' };
      }
      out.end_at = end_at;
    }
  }

  if ('note' in b) {
    const note = asString(b.note).trim();
    if (note.length > MAX_NOTE_LEN) {
      return { ok: false, error: 'Note is too long.' };
    }
    out.note = note;
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'No fields to update.' };
  }

  // If both endpoints are being set together, reject an inverted span here.
  // (Cross-field checks against the stored row happen in the route.)
  if (
    out.start_at !== undefined &&
    typeof out.end_at === 'string' &&
    Date.parse(out.end_at) < Date.parse(out.start_at)
  ) {
    return { ok: false, error: 'end_at cannot be before start_at.' };
  }

  return { ok: true, value: out };
}
