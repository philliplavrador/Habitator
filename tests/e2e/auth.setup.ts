import { expect, test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { signSession } from '../../lib/session';

export const STATE_FILE = path.join(__dirname, '.auth', 'state.json');

/** Username of the throwaway account every e2e run drives the UI as. */
const E2E_USERNAME = 'e2e';
const ONE_HOUR = 60 * 60;

/**
 * Find (or create) the e2e user and write a signed-session `storageState` for
 * it.
 *
 * Two deliberate choices:
 *
 * - **Its own user row.** Habitator is `user_id`-scoped end to end, so a
 *   dedicated account gives the tests an empty, predictable app ("No chats
 *   yet.") and keeps them from writing to the owner's dev data — /tasks alone
 *   rolls tasks forward on every read.
 * - **A minted cookie, not a login.** `POST /api/login` would need the owner's
 *   real password in the test env. Signing the token here with the same
 *   `SESSION_SECRET` the middleware verifies gets the same result with no extra
 *   secret, and it's the reason the e2e row's password hash is deliberately
 *   unusable — that account can only ever be entered this way.
 */
setup('authenticate', async ({ browser, baseURL }) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set — the e2e run needs it (from .env.local) to mint a session cookie.'
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set — start the local Postgres (docker start habitator-pg) and keep .env.local in place.'
    );
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.PGSSL === 'disable' ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  let userId: number;
  try {
    const found = await client.query<{ id: number }>(
      'SELECT id FROM users WHERE lower(username) = lower($1)',
      [E2E_USERNAME]
    );
    if (found.rows.length > 0) {
      userId = found.rows[0].id;
    } else {
      const created = await client.query<{ id: number }>(
        'INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
        [E2E_USERNAME, 'session-only-no-password', new Date().toISOString()]
      );
      userId = created.rows[0].id;
    }
  } finally {
    await client.end();
  }

  const token = await signSession(userId, secret, ONE_HOUR);
  const origin = new URL(baseURL ?? 'http://127.0.0.1:3100');
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        cookies: [
          {
            name: 'session',
            value: token,
            domain: origin.hostname,
            path: '/',
            expires: Math.floor(Date.now() / 1000) + ONE_HOUR,
            httpOnly: true,
            secure: false,
            sameSite: 'Lax',
          },
        ],
        origins: [],
      },
      null,
      2
    )
  );

  // Prove the cookie actually gets past middleware.ts before any spec runs —
  // otherwise a bad secret shows up as every test "failing to find the header".
  const context = await browser.newContext({ storageState: STATE_FILE, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/login/);
  await context.close();
});
