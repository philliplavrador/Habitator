import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  findUserByPassword,
  sessionCookieOptions,
} from '@/lib/auth';

export const runtime = 'nodejs';

const MIN_PASSWORD = 4;

// Password-only login is guessable in a way username+password isn't (there's
// only one secret), so failed attempts are throttled per client IP: after
// MAX_FAILURES misses inside the window, further attempts are refused until it
// expires. In-memory and per-instance — enough friction for a single-owner app,
// not a distributed rate limiter.
const MAX_FAILURES = 8;
const WINDOW_MS = 5 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

function isLockedOut(ip: string): boolean {
  const rec = failures.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.until) {
    failures.delete(ip);
    return false;
  }
  return rec.count >= MAX_FAILURES;
}

function recordFailure(ip: string) {
  const now = Date.now();
  const rec = failures.get(ip);
  if (!rec || now > rec.until) {
    failures.set(ip, { count: 1, until: now + WINDOW_MS });
  } else {
    rec.count += 1;
  }
}

// POST /api/login  { password }
//
// This is a single-owner app, so there is no username: the password alone
// identifies the account (findUserByPassword scrypt-checks it against each
// user). On success an httpOnly signed-session cookie is set (valid ~1 year, so
// the login sticks on the phone). Account creation is not exposed here — the
// owner's account already exists.
export async function POST(req: NextRequest) {
  if (!process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: 'Server is missing SESSION_SECRET.' },
      { status: 500 }
    );
  }

  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  let password = '';
  try {
    const body = await req.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    // fall through to the validation error below
  }

  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  const user = await findUserByPassword(password);
  if (!user) {
    recordFailure(ip);
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }
  failures.delete(ip);

  const token = await createSessionToken(user.id);
  const res = NextResponse.json({ ok: true, username: user.username });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
