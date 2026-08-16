const SHELL_CACHE = 'cravix-admin-shell-v3'
const RUNTIME_CACHE = 'cravix-admin-runtime-v3'
const SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/admin-icon.svg', '/admin-logo.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const url = new URL(event.request.url)
  if (url.origin === self.location.origin) {
    const isAppShell = event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html'
    if (isAppShell) {
      event.respondWith(
        fetch(event.request)
          .then(async (response) => {
            if (response.ok) {
              const cache = await caches.open(RUNTIME_CACHE)
              await cache.put(event.request, response.clone())
            }
            return response
          })
          .catch(async () => (await caches.match(event.request)) ?? Response.error()),
      )
      return
    }

    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        const cache = await caches.open(RUNTIME_CACHE)
        const networkPromise = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone())
            }
            return response
          })
          .catch(() => cached ?? Response.error())
        return cached ?? networkPromise
      }),
    )
    return
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request)
      return cached ?? Response.error()
    }),
  )
})
