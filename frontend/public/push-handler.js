// Web Push handlers, loaded into the generated service worker via importScripts.
// Notifications are generic by design: no message text is ever shown.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const rawUrl = payload && payload.data && payload.data.url;
  const url = typeof rawUrl === 'string' && rawUrl.startsWith('/') && !rawUrl.startsWith('//') ? rawUrl : '/chat';
  event.waitUntil(
    self.registration.showNotification((payload && payload.title) || 'Carpool', {
      body: (payload && payload.body) || 'You have a new notification',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag: 'carpool',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/chat';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          return client.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : undefined));
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
