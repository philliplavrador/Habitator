import crypto from 'node:crypto';

export const SESSION_COOKIE = 'session';
// ~1 year, so the phone stays logged in.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Constant-time string comparison. Avoids leaking password length/contents via
 * timing. Hashing both sides to a fixed length first means timingSafeEqual
 * never sees mismatched buffer lengths (which would otherwise throw and itself
 * leak length info).
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Cookie attributes for the session cookie. `secure` only in production so
 *  local http dev still works. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}
