// Shared boilerplate for the API route handlers: the auth guard's 401 response,
// the request-body JSON parse, and the URL id parser. Every route repeated
// these three; centralizing them keeps the request/response contract identical
// across routes and gives future edits a single source of truth.
//
// SERVER-ONLY.

import { NextRequest, NextResponse } from 'next/server';

/** The 401 returned whenever getCurrentUserId() resolves to null. */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/**
 * Parse a request body as JSON, returning `undefined` (never throwing) when the
 * body is absent or malformed. Callers turn `undefined` into a 400 'Invalid
 * JSON.' response.
 */
export async function readJson(req: NextRequest): Promise<unknown | undefined> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** Parse a positive-integer id from a route param, or null when it isn't one. */
export function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
