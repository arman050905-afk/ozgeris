// ÖZGERIS service worker — тек push ескертулерін көрсету үшін (offline/cache логикасы жоқ).
self.addEventListener('push', (event) => {
  let payload = { title: 'ÖZGERIS', body: 'Жаңа ескерту бар.' };
  try { if (event.data) payload = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(payload.title || 'ÖZGERIS', {
      body: payload.body || '',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
