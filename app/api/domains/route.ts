import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { addUserDomain, isDomainKey, listUserDomains } from '@/lib/domains';
import { getTimezone } from '@/lib/tz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET  /api/domains              → the custom-habit domains this user has added
// POST /api/domains { domain }   → add one (idempotent)
export async function GET() {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  return NextResponse.json({ domains: await listUserDomains(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  // Narrow to a non-null object before reading `.domain` — a valid-but-non-object
  // JSON body (e.g. the literal `null`) parses fine, so reading a property off it
  // directly would throw a 500 instead of the intended 400.
  const domain =
    typeof body === 'object' && body !== null
      ? (body as { domain?: unknown }).domain
      : undefined;
  if (!isDomainKey(domain)) {
    return NextResponse.json({ error: 'Unknown habit.' }, { status: 400 });
  }
  // Pass the owner's tz so the add-day is recorded in their local calendar
  // (drives the japanese pace clock — see addUserDomain).
  await addUserDomain(userId, domain, getTimezone());
  return NextResponse.json({ ok: true }, { status: 201 });
}
