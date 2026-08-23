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

// Where new/modified files may live. A weak coder model can smear prose into a
// file path (seen live: "We'll provide the block.app/ping/page.tsx"), which
// builds green because Next simply ignores the junk directory — so constrain
// writes to the real tree. Deletions are exempt (cleaning up such junk must
// stay possible).
const ALLOWED_DIRS = ['app/', 'components/', 'lib/', 'public/', 'docs/', 'scripts/'];
const ALLOWED_ROOT_FILES = new Set([
  'package.json',
  'package-lock.json',
  'next.config.mjs',
  'tailwind.config.ts',
  'postcss.config.mjs',
  'tsconfig.json',
  'README.md',
  'plan.md',
  '.gitignore',
]);
// Letters/digits plus the chars real paths here use — incl. Next's [param],
// [...slug], (group), @slot. No spaces, quotes, or apostrophes.
const SANE_PATH = /^[A-Za-z0-9._/\-\[\]()@+~]+$/;

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// name-status so deletions can be told apart (path rules don't apply to them).
const entries = git('diff', '--name-status', `${BASE}...HEAD`)
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l) => {
    const [status, ...rest] = l.split('\t');
    // Renames come as "R100\told\tnew" — the new path is what gets written.
    return { status: status[0], file: rest[rest.length - 1] };
  });

if (entries.length === 0) {
  console.error('agent-guard: diff is empty — nothing was built.');
  process.exit(1);
}

const violations = [];

for (const { status, file } of entries) {
  const posix = file.replace(/\\/g, '/');
  for (const p of PROTECTED) {
    if (posix === p || posix.startsWith(p)) {
      violations.push(`protected path touched: ${posix}`);
      break;
    }
  }
  if (status === 'D') continue; // deletions: path-shape rules don't apply
  if (!SANE_PATH.test(posix)) {
    violations.push(`suspicious file path (bad characters — a mis-parsed edit?): ${posix}`);
    continue;
  }
  const inAllowedDir = ALLOWED_DIRS.some((d) => posix.startsWith(d));
  if (!inAllowedDir && !ALLOWED_ROOT_FILES.has(posix)) {
    violations.push(`file outside the allowed tree: ${posix}`);
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

console.log(`agent-guard: OK (${entries.length} file(s) changed)`);
