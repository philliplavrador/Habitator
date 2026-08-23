# Habitator v2 — chat-first, self-modifying app

Date: 2026-08-23. Approved in chat by Phillip.

## Concept

Habitator's one constant is an LLM chatbox at `/`. Everything else — screens,
features, tables — is furniture the chat's agent can add, change, or remove on
request. Phillip is the only user; he drives it from phone and desktop. There
are no previews and no approval taps: a change ships automatically the moment it
builds green.

## The two lanes

1. **Chat lane (instant).** `POST /api/chat` calls DeepSeek (OpenAI-compatible
   API) with tools. It answers questions about his data (`run_sql`, guarded),
   logs things, remembers preferences (`remember`), and general-talks. Low
   verbosity, enforced by system prompt. The live DB schema (the `SCHEMA`
   constant from `lib/db.ts`) is injected so it always knows the current shape.
2. **Build lane (minutes).** When a request needs code, the model calls
   `build_app(instructions)`. The app inserts a `build_requests` row and fires a
   `repository_dispatch` at GitHub. A workflow checks out the repo, runs
   **aider** with DeepSeek against the instructions (with `AGENT.md` +
   `CLAUDE.md` files as read-only brief), loops `npm run build` → feed errors
   back → retry (max 3), runs a guard script, then pushes to `main`
   (auto-ship). Railway deploys. The workflow calls back
   `POST /api/agent/callback` (shared secret) which updates the row, appends a
   completion message to the originating chat, and sends a web push.

## Guardrails

- **Never ship red:** the workflow pushes only after `npm run build` passes.
  A failed run resets and reports back to the chat; nothing reaches `main`.
- **Protected paths** (guard script fails the run if the diff touches them):
  `.github/**`, `scripts/agent-*`, `AGENT.md`, `middleware.ts`, `lib/auth.ts`,
  `lib/session.ts`, `lib/migrate.ts`, `lib/agent/**`, `app/api/agent/**`,
  `app/api/chat/**`, `app/api/login/**`, `app/api/logout/**`,
  `components/chat/**`, `app/page.tsx`, `app/login/**`.
- **No data loss:** guard rejects added lines containing `DROP`, `TRUNCATE`, or
  `DELETE FROM`. Renames are copy-forward; feature "deletes" are soft
  (archived flags). Schema stays idempotent per existing rules.
- **SQL guard (chat lane):** single statement, first keyword in
  SELECT/INSERT/UPDATE/WITH; DELETE/DROP/TRUNCATE/ALTER/CREATE/GRANT rejected.
- **Backups:** daily workflow `pg_dump`s prod to the private repo
  `philliplavrador/habitator-backups`, keeping the last 60 dumps.
- **Serialized builds:** workflow `concurrency` group so two chat requests
  can't race a push.

## Data model (new tables, idempotent, user_id-scoped)

- `chats` (id, user_id, title, created_at)
- `chat_messages` (id, user_id, chat_id, role user|assistant, content,
  build_id?, created_at) — saved forever; this is the recovery record
  ("where did X go? add it back").
- `build_requests` (id, user_id, chat_id?, instructions, status
  queued|running|success|failed, summary, commit_sha?, error?, created_at,
  updated_at)
- `agent_memory` (id, user_id, content, source auto|explicit, created_at) —
  injected into every chat system prompt and every build dispatch. Written by
  the model's `remember` tool (self-initiated or user-commanded).

## UI

- `/` = chat (`components/chat/ChatScreen.tsx`): message list, input, chat
  history drawer (Sheet), new-chat button, AccountMenu. Build messages show a
  status chip; the client polls messages while a build is pending (the
  callback appends the completion message).
- Old Today screen moves to `/today`; `BottomNav` is removed from the layout.
  All old routes (`/today`, `/insights`, `/fasts`, …) stay live and data stays
  intact — unlinked, reachable by URL or resurfaceable by asking the chat.

## Config

- Railway env: `DEEPSEEK_API_KEY`, `GH_DISPATCH_TOKEN`, `AGENT_CALLBACK_SECRET`
  (+ optional `AGENT_BASE_URL`, `AGENT_CHAT_MODEL` — model is config, not code).
- GitHub secrets: `DEEPSEEK_API_KEY`, `AGENT_CALLBACK_SECRET`, `APP_URL`,
  `PROD_DATABASE_URL` (backups), `BACKUP_TOKEN` (push to private backup repo).

## Deliberately not built

No preview environment, no approval gate, no code-version bookkeeping beyond
git itself, no hand-rolled agent loop (aider is the runner), no multi-user
concerns beyond keeping existing `user_id` scoping intact.

## Known limits (accepted)

`npm run build` catches type errors, not wrong logic; no test suite exists, so
semantic regressions reach prod and get fixed by asking the chat. DeepSeek may
need a stronger model for hard changes — swap via env, not code.
