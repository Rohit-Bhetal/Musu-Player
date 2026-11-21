/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

// Requests whose destination is 'audio' or 'video' are deliberately left
// unrouted: nothing below matches them, so they reach the network untouched and
// Safari keeps its own Range handling. Downloaded audio never hits the SW at
// all — it is played from a blob: URL.

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Every navigation is answered from the precached shell, so a cold launch in
// Airplane Mode still boots.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/mock\//] }))

registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'artwork',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true }),
    ],
  }),
)

registerRoute(
  ({ url, request }) => request.destination !== 'audio' && url.pathname.endsWith('.json'),
  new NetworkFirst({
    cacheName: 'catalog',
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  }),
)

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting()
})
