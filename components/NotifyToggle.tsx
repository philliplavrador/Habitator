'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast';
import {
  apiPushConfig,
  apiRegisterPush,
  apiSetHabitNotifyAt,
} from '@/lib/client';

interface Props {
  habitId: number;
  /** Current reminder time, 'HH:MM' owner-local, or null when off. */
  notifyAt: string | null;
}

/**
 * Base64url VAPID key → the bytes `pushManager.subscribe` wants.
 *
 * Returns an ArrayBuffer rather than the Uint8Array view: under TS 5.7+ the
 * generic `Uint8Array<ArrayBufferLike>` no longer satisfies `BufferSource`,
 * and the underlying buffer is what the API actually reads anyway.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

/**
 * Per-habit reminder control on the habit page: pick a time, get a push at that
 * time on days the habit is due and still unfinished.
 *
 * The awkward part is iOS, and it's a platform rule rather than something the
 * app can route around: iPhone delivers Web Push ONLY to a web app added to the
 * Home Screen, never to a Safari tab. So when the APIs are missing we say what
 * to do about it instead of hiding a broken switch. `display-mode: standalone`
 * tells us whether we're already running as an installed app.
 */
export default function NotifyToggle({ habitId, notifyAt }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [time, setTime] = useState(notifyAt ?? '20:00');
  const [enabled, setEnabled] = useState(notifyAt !== null);
  const [busy, setBusy] = useState(false);
  // null while we're still checking, so nothing flashes on first paint.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [installed, setInstalled] = useState(true);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    const hasApis =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(hasApis);
    setInstalled(
      typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          // iOS Safari predates display-mode and uses this instead.
          (navigator as { standalone?: boolean }).standalone === true)
    );
    apiPushConfig()
      .then((c) => setConfigured(c.configured))
      .catch(() => setConfigured(false));
  }, []);

  async function subscribeDevice(): Promise<boolean> {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      show({
        tone: 'error',
        title: 'Notifications blocked.',
        description: 'Allow notifications for Habitator in your device settings.',
      });
      return false;
    }
    const { configured: ok, publicKey } = await apiPushConfig();
    if (!ok || !publicKey) {
      show({
        tone: 'error',
        title: 'Push is not set up on the server.',
        description: 'The VAPID keys are missing.',
      });
      return false;
    }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    // Reuse an existing subscription; re-subscribing the same device is an
    // upsert server-side, so this is safe either way.
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      }));
    await apiRegisterPush(sub.toJSON() as { endpoint: string; keys?: Record<string, string> });
    return true;
  }

  async function enable() {
    setBusy(true);
    try {
      if (!(await subscribeDevice())) return;
      await apiSetHabitNotifyAt(habitId, time);
      setEnabled(true);
      show({ tone: 'success', title: `Reminder set for ${time}.` });
      router.refresh();
    } catch (e) {
      show({
        tone: 'error',
        title: 'Could not turn on reminders.',
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      // Only this habit's reminder is cleared. The device stays subscribed, so
      // other habits keep working and re-enabling needs no permission prompt.
      await apiSetHabitNotifyAt(habitId, null);
      setEnabled(false);
      show({ tone: 'success', title: 'Reminder off.' });
      router.refresh();
    } catch (e) {
      show({
        tone: 'error',
        title: 'Could not turn off reminders.',
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  if (supported === null) return null;

  return (
    <section className="mt-6 rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-1 text-sm font-semibold text-text-secondary">Reminder</h2>

      {!supported ? (
        <p className="text-xs text-text-muted">
          This browser can&apos;t receive notifications.{' '}
          {!installed && 'On iPhone, add Habitator to your Home Screen first — tap Share, then "Add to Home Screen", and open it from there.'}
        </p>
      ) : !configured ? (
        <p className="text-xs text-text-muted">
          Reminders aren&apos;t set up on the server yet.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-text-muted">
            {enabled
              ? `A push at ${time} on days this is still unfinished.`
              : 'Get a push on days this habit is due and still unfinished.'}
            {!installed &&
              ' On iPhone this only works from the Home Screen app, not a Safari tab.'}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Reminder time"
              className="h-11 rounded-btn border border-border bg-surface2 px-3 text-sm text-text-primary"
            />
            {enabled ? (
              <>
                <Button
                  variant="secondary"
                  onClick={enable}
                  disabled={busy || time === notifyAt}
                >
                  Update
                </Button>
                <Button variant="secondary" onClick={disable} disabled={busy}>
                  Turn off
                </Button>
              </>
            ) : (
              <Button onClick={enable} loading={busy}>
                Remind me
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
