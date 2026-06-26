import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  safeEqual,
  sessionCookieOptions,
} from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) {
    return NextResponse.json(
      { error: 'Server is missing APP_PASSWORD or SESSION_SECRET.' },
      { status: 500 }
    );
  }

  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    // ignore — empty password will simply fail the compare
  }

  if (!safeEqual(password, expected)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, secret, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
