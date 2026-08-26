import fs from 'node:fs';
import path from 'node:path';

const FILES = ['.env.local', '.env'];

/**
 * Minimal `.env` reader for the Playwright process.
 *
 * Next loads `.env.local` for the app itself, but the test runner is a separate
 * process that needs two of the same values: `SESSION_SECRET` (to mint the test
 * session cookie) and `DATABASE_URL` (to make sure the e2e user row exists).
 * Kept dependency-free on purpose — one more devDependency for six lines of
 * parsing isn't worth it. Real shell env always wins over the file.
 */
export function loadEnv(root: string = process.cwd()): void {
  for (const file of FILES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    for (const raw of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
