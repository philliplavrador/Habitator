import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Expire the cookie immediately.
  res.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
  return res;
}
