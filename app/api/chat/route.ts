import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import { getTimezone } from '@/lib/tz';
import { todayISO } from '@/lib/dates';
import { runTurn } from '@/lib/agent/chat';
import { agentConfigured } from '@/lib/agent/deepseek';
import { hasPendingBuilds, listChats, listMessages } from '@/lib/agent/store';
import { parseId } from '@/lib/apiRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A turn can take several model round trips; don't let the platform default
// cut a slow tool loop short.
export const maxDuration = 60;

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
  const [messages, pending] = await Promise.all([
    listMessages(userId, chatId),
    hasPendingBuilds(userId),
  ]);
  return NextResponse.json({ messages, pending });
}

// POST /api/chat { chatId?, message } → one full agent turn
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
  const { chatId: rawChatId, message } = body as { chatId?: unknown; message?: unknown };
  const text = typeof message === 'string' ? message.trim() : '';
  if (text === '' || text.length > 8000) {
    return NextResponse.json({ error: 'Message must be 1–8000 characters.' }, { status: 400 });
  }
  const chatId = rawChatId === undefined || rawChatId === null ? null : parseId(rawChatId);
  if (rawChatId !== undefined && rawChatId !== null && chatId === null) {
    return NextResponse.json({ error: 'Invalid chatId.' }, { status: 400 });
  }

  const tz = getTimezone();
  try {
    const result = await runTurn(userId, tz, todayISO(tz), chatId, text);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent error.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
