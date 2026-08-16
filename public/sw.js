self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'RE:MIND'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/AppLogo.png',
    badge: '/AppLogo.png',
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const client = list[0]
    if (client) return client.navigate(url).then((focusedClient) => focusedClient?.focus())
    return clients.openWindow(url)
  }))
})
