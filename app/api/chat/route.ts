import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { getTimezone } from '@/lib/tz';
import { todayISO } from '@/lib/dates';
import { runTurn } from '@/lib/agent/chat';
import { agentConfigured } from '@/lib/agent/deepseek';
import {
  attachmentsByMessage,
  hasPendingBuilds,
  listChats,
  listMessages,
  type NewAttachment,
} from '@/lib/agent/store';
import { parseId } from '@/lib/apiRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A turn can take several model round trips, and a high reasoning effort makes
// each one slower; don't let the platform default cut a slow tool loop short.
export const maxDuration = 300;

// Attachments ride inline in the JSON body (images as base64 data URLs, text
// files as their decoded text) — no upload endpoint, no blob store. The caps
// are a backstop against a body big enough to wedge the request; the client
// downscales photos well under them.
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_CHARS = 4_000_000;
const MAX_TOTAL_ATTACHMENT_CHARS = 10_000_000;

// GET /api/chat              → { chats }
// GET /api/chat?chatId=N     → { messages, pending }  (pending = builds in flight,
//                              drives the client's poll loop)
export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const rawId = req.nextUrl.searchParams.get('chatId');
  if (rawId === null) {
    return NextResponse.json({ chats: await listChats(userId) });
  }
  const chatId = parseId(rawId);
  if (chatId === null) {
    return NextResponse.json({ error: 'Invalid chatId.' }, { status: 400 });
  }
  const [messages, attachments, pending] = await Promise.all([
    listMessages(userId, chatId),
    attachmentsByMessage(userId, chatId),
    hasPendingBuilds(userId),
  ]);
  return NextResponse.json({
    messages: messages.map((msg) => ({
      ...msg,
      attachments: attachments.get(msg.id) ?? [],
    })),
    pending,
  });
}

/** Validate the client's attachment list, or return the reason it's rejected. */
function parseAttachments(raw: unknown): NewAttachment[] | string {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return 'Invalid attachments.';
  if (raw.length > MAX_ATTACHMENTS) return `At most ${MAX_ATTACHMENTS} attachments per message.`;

  const out: NewAttachment[] = [];
  let total = 0;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return 'Invalid attachment.';
    const { kind, name, mime, data } = item as Record<string, unknown>;
    if (kind !== 'image' && kind !== 'text') return 'Unsupported attachment type.';
    if (typeof data !== 'string' || data === '') return 'Empty attachment.';
    if (kind === 'image' && !data.startsWith('data:image/')) {
      return 'Images must be sent as a data URL.';
    }
    if (data.length > MAX_ATTACHMENT_CHARS) return 'That file is too big.';
    total += data.length;
    if (total > MAX_TOTAL_ATTACHMENT_CHARS) return 'Those files are too big together.';
    out.push({
      kind,
      name: typeof name === 'string' ? name.slice(0, 200) : '',
      mime: typeof mime === 'string' ? mime.slice(0, 100) : '',
      data,
    });
  }
  return out;
}

// POST /api/chat { chatId?, message, attachments?, model?, effort? } → one full agent turn
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  if (!agentConfigured()) {
    return NextResponse.json(
      { error: 'DEEPSEEK_API_KEY is not configured on the server.' },
      { status: 503 }
    );
  }

  const body = await readJson(req);
  if (body === undefined || typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const {
    chatId: rawChatId,
    message,
    attachments: rawAttachments,
    model,
    effort,
  } = body as {
    chatId?: unknown;
    message?: unknown;
    attachments?: unknown;
    model?: unknown;
    effort?: unknown;
  };

  const attachments = parseAttachments(rawAttachments);
  if (typeof attachments === 'string') {
    return NextResponse.json({ error: attachments }, { status: 400 });
  }

  const text = typeof message === 'string' ? message.trim() : '';
  // A bare attachment is a valid turn ("here, look at this"); a bare nothing isn't.
  if (text === '' && attachments.length === 0) {
    return NextResponse.json({ error: 'Message must be 1–8000 characters.' }, { status: 400 });
  }
  if (text.length > 8000) {
    return NextResponse.json({ error: 'Message must be 1–8000 characters.' }, { status: 400 });
  }
  const chatId = rawChatId === undefined || rawChatId === null ? null : parseId(rawChatId);
  if (rawChatId !== undefined && rawChatId !== null && chatId === null) {
    return NextResponse.json({ error: 'Invalid chatId.' }, { status: 400 });
  }

  const tz = getTimezone();
  try {
    const result = await runTurn(userId, tz, todayISO(tz), chatId, text, {
      attachments,
      model,
      effort,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent error.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
