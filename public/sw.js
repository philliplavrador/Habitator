/* Habitator service worker — push notifications only.
 *
 * Deliberately does NOT cache or intercept fetches. The app is server-rendered
 * and always wants fresh data; a caching SW here would serve stale habit state,
 * which is worse than being offline. Its whole job is to exist so iOS/Android
 * can wake it for a push.
 *
 * iOS note: Web Push works on iPhone only for a web app added to the Home
 * Screen (Safari → Share → Add to Home Screen), not in a Safari tab. That's a
 * platform rule, not something the app can work around.
 */

self.addEventListener('install', () => {
  // Take over immediately rather than waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // A malformed payload should still surface something rather than nothing.
    data = {};
  }

  const title = data.title || 'Habitator';
  const options = {
    body: data.body || 'You have a habit to check off.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    // Collapses repeats for the same habit instead of stacking duplicates.
    tag: data.tag || 'habitator',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  // Focus an already-open window if there is one, rather than piling up tabs.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});
