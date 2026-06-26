import { NextRequest, NextResponse } from 'next/server';

/**
 * Single shared-password gate.
 *
 * Every request except the public ones below must carry a `session` cookie
 * whose value equals SESSION_SECRET (set when the owner logs in). The compare
 * runs in the Edge runtime, so we use a plain string comparison — the cookie
 * value is an opaque secret, not user input being checked against a password.
 *
 * Static assets and the login flow are excluded so an unauthenticated browser
 * can still render the login page and load its CSS/icons.
 */

const PUBLIC_PATHS = new Set<string>(['/login', '/api/login']);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const session = req.cookies.get('session')?.value;
  const secret = process.env.SESSION_SECRET;

  if (secret && session === secret) {
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
