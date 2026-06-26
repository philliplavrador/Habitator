import { isValidISODate, todayISO } from './dates';
import type { HabitInput } from './types';

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
