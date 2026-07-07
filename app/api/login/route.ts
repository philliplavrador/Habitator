import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  createUser,
  findUserByUsername,
  safeEqual,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';

export const runtime = 'nodejs';

const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,32}$/;
const MIN_PASSWORD = 4;

// POST /api/login  { username, password, code? }
//
// One box for both signing in and signing up:
//   • Existing username → the password must match.
//   • New username      → allowed only when `code` matches REGISTRATION_CODE
//     (the shared invite secret). Then the account is created and logged in.
// On success an httpOnly signed-session cookie is set (valid ~1 year, so the
// login sticks on the phone).
export async function POST(req: NextRequest) {
  if (!process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: 'Server is missing SESSION_SECRET.' },
      { status: 500 }
    );
  }

  let username = '';
  let password = '';
  let code = '';
  try {
    const body = await req.json();
    username = typeof body?.username === 'string' ? body.username.trim() : '';
    password = typeof body?.password === 'string' ? body.password : '';
    code = typeof body?.code === 'string' ? body.code : '';
  } catch {
    // fall through to the validation error below
  }

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 1–32 letters, numbers, or . _ -' },
      { status: 400 }
    );
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD} characters.` },
      { status: 400 }
    );
  }

  const existing = await findUserByUsername(username);

  let userId: number;
  if (existing) {
    // Sign in.
    if (!verifyPassword(password, existing.password_hash)) {
      return NextResponse.json(
        { error: 'Incorrect username or password.' },
        { status: 401 }
      );
    }
    userId = existing.id;
  } else {
    // Sign up — gated by the shared registration code.
    const expectedCode = process.env.REGISTRATION_CODE;
    if (!expectedCode) {
      return NextResponse.json(
        { error: 'Sign-ups are disabled. Ask the owner to create your account.' },
        { status: 403 }
      );
    }
    if (!code || !safeEqual(code, expectedCode)) {
      return NextResponse.json(
        {
          error:
            'That account doesn’t exist. To create it, enter the registration code.',
          needsCode: true,
        },
        { status: 403 }
      );
    }
    try {
      const created = await createUser(username, password);
      userId = created.id;
    } catch {
      // Almost certainly a race that lost the unique-username insert.
      return NextResponse.json(
        { error: 'That username is taken.' },
        { status: 409 }
      );
    }
  }

  const token = await createSessionToken(userId);
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
