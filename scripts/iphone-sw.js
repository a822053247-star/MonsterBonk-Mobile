const CACHE = 'monsterbonk-phone-__VERSION__';
const ROOT = self.registration.scope;
const FILES = __FILES__;
const urls = FILES.map(path => new URL(path, ROOT).href);
const allowed = new Set(urls);
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  let cursor = 0, done = 0;
  try {
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < urls.length) {
        const url = urls[cursor++], response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw new Error(`Offline download failed: ${url}`);
        await cache.put(url, response); done++;
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clients) client.postMessage({ type: 'offline-progress', percent: Math.floor(done / urls.length * 100) });
      }
    }));
  } catch (error) { await caches.delete(CACHE); throw error; }
  // Updates wait until the previous game is closed; never reload an active run.
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('monsterbonk-phone-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;
  const navigation = request.mode === 'navigate' && url.pathname === new URL(ROOT).pathname;
  const key = navigation ? new URL('index.html', ROOT).href : url.href;
  if (!allowed.has(key)) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE)).match(key);
    return cached ?? fetch(request);
  })());
});
