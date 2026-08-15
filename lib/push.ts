import webpush from 'web-push';
import { many, run } from './db';
import { nowISO } from './dates';

/**
 * Web Push plumbing — subscription storage plus the actual send.
 *
 * Server-only (imports `pg`); never pull this into a client component.
 *
 * Configuration lives entirely in env: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * (a keypair generated once with `webpush.generateVAPIDKeys()`) and an optional
 * VAPID_SUBJECT. When the keys are absent the module stays INERT rather than
 * throwing: `pushConfigured()` is false, the subscribe route 503s, the UI hides
 * the toggle, and the sender no-ops. That's deliberate — the feature ships dark
 * and lights up the moment the keys are set on the running instance, without a
 * redeploy breaking anything in between.
 */

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

/** The public half, for the browser's `pushManager.subscribe`. Null if unset. */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** True when both halves of the keypair are present. */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;

/** Apply the VAPID details to the web-push singleton, once per process. */
function ensureConfigured(): boolean {
  if (!pushConfigured()) return false;
  if (configured) return true;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@habitator.app',
    process.env.VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string
  );
  configured = true;
  return true;
}

/**
 * Store (or refresh) a device's subscription. Keyed on `endpoint`, which IS the
 * push service's unique address for that device, so re-subscribing the same
 * browser updates its keys instead of piling up rows. The endpoint can migrate
 * between users on a shared device, hence user_id is updated too.
 */
export async function saveSubscription(
  userId: number,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  await run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh  = EXCLUDED.p256dh,
           auth    = EXCLUDED.auth`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, nowISO()]
  );
}

/** Drop one device's subscription (user-scoped, so you can't unsubscribe others). */
export async function deleteSubscription(
  userId: number,
  endpoint: string
): Promise<number> {
  const rows = await many<{ id: number }>(
    `DELETE FROM push_subscriptions
      WHERE user_id = $1 AND endpoint = $2
      RETURNING id`,
    [userId, endpoint]
  );
  return rows.length;
}

export function listSubscriptions(userId: number): Promise<PushSubscriptionRow[]> {
  return many<PushSubscriptionRow>(
    `SELECT * FROM push_subscriptions WHERE user_id = $1 ORDER BY id ASC`,
    [userId]
  );
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap should land. */
  url?: string;
  /** Collapse key — repeats with the same tag replace rather than stack. */
  tag?: string;
}

/**
 * Fan a payload out to every device a user has registered.
 *
 * A 404/410 from the push service means that subscription is dead (app deleted,
 * permission revoked), so it's pruned — otherwise the table would grow stale
 * endpoints forever and every send would retry them. Any other failure is
 * counted but swallowed: one unreachable device must not abort the others, and
 * the caller is a cron with nobody to show an error to.
 */
export async function sendToUser(
  userId: number,
  payload: PushPayload
): Promise<{ sent: number; failed: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, failed: 0, pruned: 0 };

  const subs = await listSubscriptions(userId);
  if (subs.length === 0) return { sent: 0, failed: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await run(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
          pruned++;
        } else {
          failed++;
        }
      }
    })
  );

  return { sent, failed, pruned };
}
