/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// App shell: precached at install, versioned by the build.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Single-page app: every navigation gets the cached shell, except the API.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
);

// Only successful CORS responses are cached, never opaque ones (docs/SECURITY.md §5.10).
const okOnly = new CacheableResponsePlugin({ statuses: [200] });

// Map style, sprites and fonts change rarely.
registerRoute(
  ({ url }) => url.origin === 'https://tiles.openfreemap.org' && !/\.pbf$/.test(url.pathname),
  new StaleWhileRevalidate({ cacheName: 'map-style', plugins: [okOnly] }),
);

// Vector tiles: cache-first so the map works offline once an area is downloaded.
registerRoute(
  ({ url }) => url.origin === 'https://tiles.openfreemap.org' && /\.pbf$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'map-tiles',
    plugins: [okOnly, new ExpirationPlugin({ maxEntries: 5000, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// The API is never cached by the service worker.

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
