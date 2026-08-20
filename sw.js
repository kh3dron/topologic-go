// Service worker for per-move Web Push notifications. Scope = site root
// (served from public/). Payloads are JSON { title, body, path } produced by
// supabase/functions/_shared/webpush.ts; clicking the notification focuses an
// open tab on the game or opens one.

self.addEventListener('push', (event) => {
  let data = { title: 'Topologic Games', body: 'Your move', path: '' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // opaque payload: show the default
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: './favicon.svg',
    data: { path: data.path },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.path || '.', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url === url && 'focus' in w) return w.focus();
    }
    return clients.openWindow(url);
  })());
});
