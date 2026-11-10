const CACHE_NAME = 'story-bridge-shell-v2';
const STATIC_FILES = [
  '/',
  '/robots.txt',
  '/manifest.webmanifest',
  '/assets/icons/app-192.png',
  '/assets/icons/app-512.png',
  '/assets/icons/app-maskable-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/discover.svg',
  '/assets/icons/cultures.svg',
  '/assets/icons/share-story.svg',
  '/assets/icons/profile.svg',
  '/assets/icons/search.svg',
  '/assets/icons/bell.svg',
  '/assets/icons/bookmark.svg',
  '/assets/logo/story-bridge-mark.svg',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(STATIC_FILES.map(async file => {
      const response = await fetch(file, { cache: 'reload' });
      if (response.ok) await cache.put(file, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('story-bridge-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Network first: after a deploy every visitor gets the new page (and its new asset
    // hashes) straight away. The cached shell is only used when the network is down.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request, { signal: AbortSignal.timeout(6000) });
        if (response.ok) cache.put('/', response.clone());
        return response;
      } catch {
        const cachedShell = await cache.match('/');
        if (cachedShell) return cachedShell;
        return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline — Story Bridge</title><main style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><h1>You’re offline</h1><p>Connect to the internet and try again. Stories you write are never lost by this page.</p></main></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  if (!['script', 'style', 'image', 'font'].includes(request.destination)) return;
  const cachePromise = caches.open(CACHE_NAME);
  const refresh = cachePromise.then(cache => fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  })).catch(() => null);
  event.waitUntil(refresh.then(() => undefined));
  event.respondWith((async () => {
    const cache = await cachePromise;
    const cached = await cache.match(request);
    return cached || await refresh || Response.error();
  })());
});
