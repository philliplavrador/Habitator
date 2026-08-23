import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { readJson } from '@/lib/apiRoute';
import { addMessage, getBuildRequest, updateBuildRequest } from '@/lib/agent/store';
import { sendToUser } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/agent/callback — the GitHub workflow reporting a build's fate.
// Service-to-service: authenticated by the AGENT_CALLBACK_SECRET header, not a
// session (the runner has no cookie). Updates the build row, appends the
// completion message to the originating chat, and pushes a notification.
export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_CALLBACK_SECRET;
  const given = req.headers.get('x-agent-secret') ?? '';
  if (!secret || !timingSafeEq(given, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readJson(req);
  if (body === undefined || typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const { buildId, status, summary, commitSha, error } = body as {
    buildId?: unknown;
    status?: unknown;
    summary?: unknown;
    commitSha?: unknown;
    error?: unknown;
  };

  const id = Number(buildId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid buildId.' }, { status: 400 });
  }
  if (status !== 'running' && status !== 'success' && status !== 'failed') {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const build = await getBuildRequest(id);
  if (!build) return NextResponse.json({ error: 'Unknown build.' }, { status: 404 });

  await updateBuildRequest(id, {
    status,
    summary: typeof summary === 'string' ? summary : undefined,
    commit_sha: typeof commitSha === 'string' ? commitSha : undefined,
    error: typeof error === 'string' ? error : undefined,
  });

  // Terminal states land back in the chat (the client polls while pending) and
  // on the lock screen. 'running' is just a row update.
  if (status === 'success' || status === 'failed') {
    const line =
      status === 'success'
        ? `✓ Live: ${typeof summary === 'string' && summary ? summary : 'your change is deployed.'}`
        : `✗ Build failed: ${typeof error === 'string' && error ? error.slice(0, 500) : 'unknown error.'} Ask me to try again.`;
    if (build.chat_id !== null) {
      await addMessage(build.user_id, build.chat_id, 'assistant', line, id);
    }
    await sendToUser(build.user_id, {
      title: 'Habitator',
      body: line,
      tag: `build-${id}`,
      url: '/',
    });
  }

  return NextResponse.json({ ok: true });
}

function timingSafeEq(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}
