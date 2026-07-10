// Multi-user auth — Node runtime only (uses node:crypto for scrypt password
// hashing and pg for the users table). The middleware must NOT import this file;
// it uses the runtime-agnostic lib/session.ts instead.

import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { one } from './db';
import { signSession, verifySession } from './session';

export const SESSION_COOKIE = 'session';
// ~1 year, so the phone stays logged in ("save your login").
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

// ── Password hashing (scrypt, no external dependency) ───────────────

// Key length for NEWLY hashed passwords. verifyPassword does NOT use this
// constant — it derives the keylen from the stored hash's own length — so
// changing this value only affects new hashes and never breaks verification of
// existing ones.
const SCRYPT_KEYLEN = 64;

/** Hash a password as `scrypt$<saltHex>$<hashHex>` (per-password random salt). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verify of a password against a stored `scrypt$…` hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  let actual: Buffer;
  try {
    // keylen is DERIVED from the stored hash (expected.length), NOT a hardcoded
    // 64 — so hashes produced under any past/future SCRYPT_KEYLEN still verify.
    actual = crypto.scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  // Length-guard before timingSafeEqual (it throws on differing lengths), then a
  // constant-time compare so a wrong password can't be found byte-by-byte.
  return (
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  );
}

/**
 * Constant-time string comparison (for the registration code). Hashes both
 * sides to a fixed length first so timingSafeEqual never sees mismatched
 * lengths (which would throw and leak length info).
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ── Session cookie ──────────────────────────────────────────────────

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

/** Build a signed session-cookie value for a user id. */
export function createSessionToken(uid: number): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set.');
  return signSession(uid, secret, SESSION_MAX_AGE);
}

// ── Users table ─────────────────────────────────────────────────────

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export async function findUserByUsername(
  username: string
): Promise<UserRow | undefined> {
  return one<UserRow>('SELECT * FROM users WHERE lower(username) = lower($1)', [
    username,
  ]);
}

/** The display username for a user id (for the account menu), or null. */
export async function getUsername(userId: number): Promise<string | null> {
  const row = await one<{ username: string }>(
    'SELECT username FROM users WHERE id = $1',
    [userId]
  );
  return row?.username ?? null;
}

/** Create a user with a fresh password hash. Caller enforces the signup policy. */
export async function createUser(
  username: string,
  password: string
): Promise<UserRow> {
  const row = await one<UserRow>(
    `INSERT INTO users (username, password_hash, created_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [username, hashPassword(password), new Date().toISOString()]
  );
  return row!;
}

// ── Current user (request-scoped) ───────────────────────────────────

/** The logged-in user's id from the session cookie, or null. */
export async function getCurrentUserId(): Promise<number | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const token = cookies().get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token, secret);
  return payload?.uid ?? null;
}

/**
 * The logged-in user's id, or redirect to /login. Use in server components /
 * pages. (Middleware already gates these, so the redirect is a safety net.)
 */
export async function requireUserId(): Promise<number> {
  const uid = await getCurrentUserId();
  if (uid === null) redirect('/login');
  return uid;
}
