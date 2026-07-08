import {
  compareISO,
  hoursBetween,
  isValidISODate,
  isValidTimestamp,
  nowISO,
  todayISO,
} from './dates';
import { normalizeSchedule } from './schedule';
import type {
  AnkiDayInput,
  HabitInput,
  RepProgramInput,
  StartFastInput,
  UpdateFastInput,
} from './types';

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

/** Narrow an unknown request body to a plain object, or null if it isn't one. */
function asObject(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : null;
}

/** Coerce to a finite number within [min, max], or null. */
function coerceNumber(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Coerce to an integer within [min, max], or null. */
function coerceInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * Validate/normalize a habit create/update payload.
 * - name is required (trimmed, non-empty, capped length)
 * - details/exceptions default to ''
 * - kind defaults to 'build'; only 'build' | 'quit' are accepted
 * - schedule defaults to daily; validated/normalized by lib/schedule.ts
 * - start_date defaults to today (in the owner's `tz`); must be a valid YYYY-MM-DD
 * - end_date is optional (blank/missing ⇒ null, i.e. ongoing); when present it
 *   must be a valid YYYY-MM-DD on or after start_date
 */
export function parseHabitInput(body: unknown, tz: string): ParseResult<HabitInput> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };

  const name = asString(b.name).trim();
  if (name.length === 0) return { ok: false, error: 'Name is required.' };
  if (name.length > 200) return { ok: false, error: 'Name is too long.' };

  const details = asString(b.details).trim();
  const exceptions = asString(b.exceptions).trim();

  const rawKind = asString(b.kind).trim();
  const kind = rawKind === '' ? 'build' : rawKind;
  if (kind !== 'build' && kind !== 'quit') {
    return { ok: false, error: "kind must be 'build' or 'quit'." };
  }

  const sched = normalizeSchedule(b.schedule);
  if (!sched.ok) return { ok: false, error: sched.error };

  const rawStart = asString(b.start_date).trim();
  const start_date = rawStart === '' ? todayISO(tz) : rawStart;
  if (!isValidISODate(start_date)) {
    return { ok: false, error: 'start_date must be a valid YYYY-MM-DD date.' };
  }

  // end_date is optional: blank/missing ⇒ null (ongoing). When present it must be
  // a valid date on or after start_date.
  const rawEnd = asString(b.end_date).trim();
  const end_date = rawEnd === '' ? null : rawEnd;
  if (end_date !== null) {
    if (!isValidISODate(end_date)) {
      return { ok: false, error: 'end_date must be a valid YYYY-MM-DD date.' };
    }
    if (compareISO(end_date, start_date) < 0) {
      return { ok: false, error: 'end_date cannot be before the start date.' };
    }
  }

  return {
    ok: true,
    value: {
      name,
      details,
      exceptions,
      kind,
      schedule: sched.value,
      start_date,
      end_date,
    },
  };
}

// ── Fasting ─────────────────────────────────────────────────────────

function parseGoalHours(v: unknown): number | null {
  return coerceNumber(v, MIN_GOAL_HOURS, MAX_GOAL_HOURS);
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
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };

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
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };
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

// ── Rep programs (pushups / pullups) ────────────────────────────────

const MAX_REPS = 1000; // absurd upper bound to reject fat-finger input

/**
 * Validate the actual reps logged for a session: exactly `sets` non-negative
 * integers, each within a sane bound. Both programs use 3 sets.
 */
export function parseRepSets(body: unknown, sets = 3): ParseResult<number[]> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };
  const raw = b.reps;
  if (!Array.isArray(raw) || raw.length !== sets) {
    return { ok: false, error: `reps must be an array of ${sets} numbers.` };
  }
  const reps: number[] = [];
  for (const v of raw) {
    const n = coerceInt(v, 0, MAX_REPS);
    if (n === null) {
      return { ok: false, error: `Each set's reps must be a whole number 0–${MAX_REPS}.` };
    }
    reps.push(n);
  }
  return { ok: true, value: reps };
}

// ── User-defined rep programs ───────────────────────────────────────

const MAX_SETS = 10;
const MAX_PROGRAM_DAYS = 2000;
const MAX_REST_SECONDS = 3600; // 1 hour between sets is plenty
const MAX_DAY1_PER_SET = 1000;

/**
 * Validate a NEW rep program's config: name + ramp (sets, day-1 total, program
 * length, rest). `day1_total` must be at least `sets` (so each set gets ≥ 1 rep)
 * and no more than sets × 1000.
 */
export function parseRepProgramInput(body: unknown): ParseResult<RepProgramInput> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };

  const name = asString(b.name).trim();
  if (name.length === 0) return { ok: false, error: 'Name is required.' };
  if (name.length > 200) return { ok: false, error: 'Name is too long.' };

  const sets = coerceInt(b.sets, 1, MAX_SETS);
  if (sets === null) {
    return { ok: false, error: `Sets must be a whole number 1–${MAX_SETS}.` };
  }
  const day1_total = coerceInt(b.day1_total, sets, sets * MAX_DAY1_PER_SET);
  if (day1_total === null) {
    return {
      ok: false,
      error: `Day-1 total reps must be a whole number ${sets}–${sets * MAX_DAY1_PER_SET}.`,
    };
  }
  const program_days = coerceInt(b.program_days, 1, MAX_PROGRAM_DAYS);
  if (program_days === null) {
    return {
      ok: false,
      error: `Program length must be a whole number 1–${MAX_PROGRAM_DAYS} days.`,
    };
  }
  const rest_seconds = coerceInt(b.rest_seconds, 0, MAX_REST_SECONDS);
  if (rest_seconds === null) {
    return {
      ok: false,
      error: `Rest must be a whole number 0–${MAX_REST_SECONDS} seconds.`,
    };
  }

  return {
    ok: true,
    value: { name, sets, day1_total, program_days, rest_seconds },
  };
}

/** Validate an EDIT to a rep program — only name + rest (ramp is frozen). */
export function parseRepProgramEdit(
  body: unknown
): ParseResult<{ name: string; rest_seconds: number }> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };

  const name = asString(b.name).trim();
  if (name.length === 0) return { ok: false, error: 'Name is required.' };
  if (name.length > 200) return { ok: false, error: 'Name is too long.' };

  const rest_seconds = coerceInt(b.rest_seconds, 0, MAX_REST_SECONDS);
  if (rest_seconds === null) {
    return {
      ok: false,
      error: `Rest must be a whole number 0–${MAX_REST_SECONDS} seconds.`,
    };
  }
  return { ok: true, value: { name, rest_seconds } };
}

// ── Anki — Core 2k/6k Japanese deck ─────────────────────────────────

const MAX_NEW_CARDS = 10000; // absurd upper bound to reject fat-finger input

function parseNewCards(v: unknown): number | null {
  return coerceInt(v, 0, MAX_NEW_CARDS);
}

const newCardsError = `new_cards must be a whole number 0–${MAX_NEW_CARDS}.`;

/**
 * Validate a day-log payload: a non-negative integer `new_cards` and an
 * optional `date` (defaults to today in the owner's `tz`). Used by POST /api/anki.
 */
export function parseAnkiDayInput(
  body: unknown,
  tz: string
): ParseResult<AnkiDayInput> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };

  const rawDate = asString(b.date).trim();
  const date = rawDate === '' ? todayISO(tz) : rawDate;
  if (!isValidISODate(date)) {
    return { ok: false, error: 'date must be a valid YYYY-MM-DD date.' };
  }

  const new_cards = parseNewCards(b.new_cards);
  if (new_cards === null) return { ok: false, error: newCardsError };

  return { ok: true, value: { date, new_cards } };
}

/** Validate just the `new_cards` field — for PATCH /api/anki/[id]. */
export function parseNewCardsField(body: unknown): ParseResult<number> {
  const b = asObject(body);
  if (!b) return { ok: false, error: 'Expected a JSON object.' };
  const new_cards = parseNewCards(b.new_cards);
  if (new_cards === null) return { ok: false, error: newCardsError };
  return { ok: true, value: new_cards };
}
