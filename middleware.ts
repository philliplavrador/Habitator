import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';

/**
 * Per-user session gate.
 *
 * Every request except the public ones below must carry a `session` cookie
 * holding a valid signed token (issued at login, keyed by SESSION_SECRET). The
 * signature + expiry are verified here in the Edge runtime via Web Crypto
 * (lib/session.ts). We only check that the token is valid — the actual user id
 * is decoded again in the Node handlers/pages (getCurrentUserId).
 *
 * Static assets and the login flow are excluded so an unauthenticated browser
 * can still render the login page and load its CSS/icons.
 */

const PUBLIC_PATHS = new Set<string>(['/login', '/api/login']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  const token = req.cookies.get('session')?.value;
  const payload = secret ? await verifySession(token, secret) : null;

  if (payload) {
    return NextResponse.next();
  }

  // API requests get a clean 401; page requests get redirected to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and public static files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|robots.txt).*)',
  ],
};
