import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { readJson, unauthorized } from '@/lib/apiRoute';
import {
  deleteSubscription,
  pushConfigured,
  saveSubscription,
  vapidPublicKey,
} from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The browser needs the VAPID public key to call pushManager.subscribe(). It's
// served at RUNTIME rather than baked in as a NEXT_PUBLIC_* build-time constant
// so the keypair can be added to the running instance without a rebuild — and
// so a deploy with no keys reports `configured: false` instead of shipping an
// undefined key into subscribe() and failing cryptically.
export async function GET() {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: vapidPublicKey(),
  });
}

// POST /api/push  { endpoint, keys: { p256dh, auth } } → register this device
export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  if (!pushConfigured()) {
    return NextResponse.json(
      { error: 'Push is not configured on this server.' },
      { status: 503 }
    );
  }

  const body = await readJson(req);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const b = (body ?? {}) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = typeof b.endpoint === 'string' ? b.endpoint.trim() : '';
  const p256dh = typeof b.keys?.p256dh === 'string' ? b.keys.p256dh : '';
  const auth = typeof b.keys?.auth === 'string' ? b.keys.auth : '';

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Bad subscription.' }, { status: 400 });
  }

  await saveSubscription(userId, { endpoint, keys: { p256dh, auth } });
  return NextResponse.json({ ok: true });
}

// DELETE /api/push?endpoint=... → drop this device's registration
export async function DELETE(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (userId === null) return unauthorized();

  const endpoint = req.nextUrl.searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'Bad endpoint.' }, { status: 400 });
  }
  const removed = await deleteSubscription(userId, endpoint);
  return NextResponse.json({ ok: true, removed });
}
