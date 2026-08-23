// Guard for the chat model's `run_sql` tool. The model may read and add data,
// never destroy it: single statement only, first keyword SELECT/INSERT/UPDATE/
// WITH, and the destructive/DDL keywords are rejected outright. Schema changes
// go through the build lane, which has its own diff guard (scripts/agent-guard).
// Pure — no imports — so it's trivially testable.

const ALLOWED_FIRST = /^(select|insert|update|with)\b/i;

// Word-boundary scan for anything that can lose data or mutate schema/grants.
// UPDATE is allowed (it edits, doesn't destroy) — the no-data-loss rule here is
// about DROP/TRUNCATE/DELETE, matching the build-lane guard.
const FORBIDDEN =
  /\b(delete|drop|truncate|alter|create|grant|revoke|copy|vacuum|reindex|comment)\b/i;

export type SqlCheck = { ok: true; sql: string } | { ok: false; error: string };

export function checkSql(raw: string): SqlCheck {
  let sql = raw.trim();
  // Allow one trailing semicolon, then any remaining `;` means multi-statement.
  sql = sql.replace(/;\s*$/, '');
  if (sql === '') return { ok: false, error: 'Empty SQL.' };
  if (sql.includes(';')) {
    return { ok: false, error: 'Only a single SQL statement is allowed.' };
  }
  if (!ALLOWED_FIRST.test(sql)) {
    return {
      ok: false,
      error: 'Only SELECT / INSERT / UPDATE / WITH statements are allowed.',
    };
  }
  const hit = FORBIDDEN.exec(sql);
  if (hit) {
    return {
      ok: false,
      error: `Forbidden keyword "${hit[1].toUpperCase()}" — data can be read and added, never deleted; schema changes go through builds.`,
    };
  }
  return { ok: true, sql };
}
