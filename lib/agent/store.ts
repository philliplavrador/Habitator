// Persistence for the chat + build lanes: chats, their messages, and
// build_requests rows. Chats are SAVED FOREVER — the message log is the
// recovery record for anything the agent later changes or removes — so there
// is deliberately no delete here. SERVER-ONLY (imports pg via ./db).

import { many, one, run } from '../db';
import { nowISO } from '../dates';

export interface ChatRow {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
}

export interface ChatMessageRow {
  id: number;
  user_id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  content: string;
  build_id: number | null;
  created_at: string;
}

export type BuildStatus = 'queued' | 'running' | 'success' | 'failed';

export interface BuildRequestRow {
  id: number;
  user_id: number;
  chat_id: number | null;
  instructions: string;
  status: BuildStatus;
  summary: string;
  commit_sha: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// ── Chats ───────────────────────────────────────────────────────────

export async function listChats(userId: number): Promise<ChatRow[]> {
  return many<ChatRow>(
    `SELECT * FROM chats WHERE user_id = $1 ORDER BY id DESC LIMIT 100`,
    [userId]
  );
}

export async function getChat(userId: number, chatId: number): Promise<ChatRow | undefined> {
  return one<ChatRow>(`SELECT * FROM chats WHERE id = $1 AND user_id = $2`, [
    chatId,
    userId,
  ]);
}

/** Create a chat, titled from the first message (trimmed to a listing-size line). */
export async function createChat(userId: number, firstMessage: string): Promise<ChatRow> {
  const title = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 60);
  const row = await one<ChatRow>(
    `INSERT INTO chats (user_id, title, created_at) VALUES ($1, $2, $3) RETURNING *`,
    [userId, title, nowISO()]
  );
  return row as ChatRow;
}

// ── Messages ────────────────────────────────────────────────────────

export async function listMessages(
  userId: number,
  chatId: number
): Promise<ChatMessageRow[]> {
  return many<ChatMessageRow>(
    `SELECT * FROM chat_messages WHERE chat_id = $1 AND user_id = $2 ORDER BY id ASC`,
    [chatId, userId]
  );
}

export async function addMessage(
  userId: number,
  chatId: number,
  role: 'user' | 'assistant',
  content: string,
  buildId?: number
): Promise<ChatMessageRow> {
  const row = await one<ChatMessageRow>(
    `INSERT INTO chat_messages (user_id, chat_id, role, content, build_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, chatId, role, content, buildId ?? null, nowISO()]
  );
  return row as ChatMessageRow;
}

// ── Build requests ──────────────────────────────────────────────────

export async function createBuildRequest(
  userId: number,
  chatId: number,
  instructions: string
): Promise<BuildRequestRow> {
  const now = nowISO();
  const row = await one<BuildRequestRow>(
    `INSERT INTO build_requests (user_id, chat_id, instructions, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4) RETURNING *`,
    [userId, chatId, instructions, now]
  );
  return row as BuildRequestRow;
}

export async function getBuildRequest(id: number): Promise<BuildRequestRow | undefined> {
  return one<BuildRequestRow>(`SELECT * FROM build_requests WHERE id = $1`, [id]);
}

/** Any builds of this user's still in flight (drives the client's polling). */
export async function hasPendingBuilds(userId: number): Promise<boolean> {
  const row = await one<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM build_requests
     WHERE user_id = $1 AND status IN ('queued','running')`,
    [userId]
  );
  return Number(row?.n ?? 0) > 0;
}

/** The workflow's callback: move a build to its next status. */
export async function updateBuildRequest(
  id: number,
  patch: { status: BuildStatus; summary?: string; commit_sha?: string; error?: string }
): Promise<void> {
  await run(
    `UPDATE build_requests
     SET status = $2,
         summary = COALESCE($3, summary),
         commit_sha = COALESCE($4, commit_sha),
         error = COALESCE($5, error),
         updated_at = $6
     WHERE id = $1`,
    [id, patch.status, patch.summary ?? null, patch.commit_sha ?? null, patch.error ?? null, nowISO()]
  );
}
