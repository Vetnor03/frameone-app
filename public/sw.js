self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'RE:MIND'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/favicon-32x32.png',
    data: { url: data.url || '/?tab=assistant' },
    tag: data.tag || undefined,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/?tab=assistant'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if ('focus' in client) return client.focus().then(() => client.navigate(url))
    }
    return clients.openWindow(url)
  }))
})
