// Guard for the build lane: runs on the runner AFTER the coding agent, BEFORE
// the push to main. Fails the run if the diff (origin/main...HEAD) touches a
// protected path or adds destructive SQL. This file is itself on the protected
// list, so the agent can't loosen its own leash.
//
// Usage: node scripts/agent-guard.mjs   (exits non-zero on violation)

import { execFileSync } from 'node:child_process';

const BASE = process.env.GUARD_BASE || 'origin/main';

// Prefix matches (dir or exact file). Keep in sync with AGENT.md's list.
const PROTECTED = [
  '.github/',
  'scripts/agent-',
  'AGENT.md',
  'middleware.ts',
  'lib/auth.ts',
  'lib/session.ts',
  'lib/migrate.ts',
  'lib/agent/',
  'app/api/agent/',
  'app/api/chat/',
  'app/api/login/',
  'app/api/logout/',
  'components/chat/',
  'app/page.tsx',
  'app/login/',
];

// Destructive SQL in ADDED lines only (existing code may legitimately contain
// e.g. the pre-agent hard-delete routes; the agent just can't add more).
const DESTRUCTIVE = /\b(drop\s+(table|column|index|schema)|truncate)\b|\bdelete\s+from\b/i;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const files = git('diff', '--name-only', `${BASE}...HEAD`)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

if (files.length === 0) {
  console.error('agent-guard: diff is empty — nothing was built.');
  process.exit(1);
}

const violations = [];

for (const f of files) {
  const posix = f.replace(/\\/g, '/');
  for (const p of PROTECTED) {
    if (posix === p || posix.startsWith(p)) {
      violations.push(`protected path touched: ${posix}`);
      break;
    }
  }
}

// Scan only added lines of the patch for destructive SQL.
const patch = git('diff', '--unified=0', `${BASE}...HEAD`);
let current = '';
for (const line of patch.split('\n')) {
  if (line.startsWith('+++ b/')) {
    current = line.slice(6);
    continue;
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  if (DESTRUCTIVE.test(line)) {
    violations.push(`destructive SQL added in ${current}: ${line.slice(1).trim().slice(0, 120)}`);
  }
}

if (violations.length > 0) {
  console.error('agent-guard: REJECTED\n' + violations.map((v) => `  - ${v}`).join('\n'));
  process.exit(1);
}

console.log(`agent-guard: OK (${files.length} file(s) changed)`);
