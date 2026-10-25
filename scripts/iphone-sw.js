const VERSION = '__VERSION__';
const CACHE = 'monsterbonk-phone-' + VERSION;
const ASSETS = 'monsterbonk-assets-v2';
const ROOT = self.registration.scope;
const FILES = __FILES__;
const HASHES = __HASHES__;
const urls = FILES.map(path => new URL(path, ROOT).href);
const hashes = new Map(FILES.map((path, i) => [urls[i], HASHES[path]]));
const index = new URL('index.html', ROOT).href;
const readyKey = new URL('__offline-ready', ROOT).href;
let paused = false, downloading;
async function notify(message) {
  for (const client of await self.clients.matchAll({includeUncontrolled:true})) client.postMessage(message);
}
function contentKey(url) { return new URL('__asset/' + hashes.get(url), ROOT).href; }
async function valid(response, url) {
  const digest = await crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer());
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('') === hashes.get(url);
}
async function cachedAsset(url) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(contentKey(url));
  if (cached) return cached;
  // Migrate unchanged resources from the previously installed game on demand.
  for (const name of await caches.keys()) {
    if (!name.startsWith('monsterbonk-phone-') || name === CACHE) continue;
    const old = await (await caches.open(name)).match(url);
    if (old && await valid(old,url)) { await cache.put(contentKey(url),old.clone()); return old; }
  }
}
async function storeAsset(url, response) {
  if (response.ok && await valid(response,url)) {
    await (await caches.open(ASSETS)).put(contentKey(url),response); return true;
  }
  return false;
}
async function downloadOffline() {
  if (downloading) return downloading;
  let stopped = false;
  downloading = (async () => {
    let done = 0;
    try {
      // One opt-in background lane. Battle pauses it; nothing downloads on install.
      for (const url of urls) {
        if (paused) { stopped = true; await notify({type:'offline-paused'}); return; }
        if (!await cachedAsset(url)) {
          const response = await fetch(url,{cache:'default',priority:'low'});
          if (!await storeAsset(url,response)) throw new Error('Resource unavailable or release changed');
        }
        done++; await notify({type:'offline-progress',percent:Math.floor(done/urls.length*100)});
      }
      await (await caches.open(CACHE)).put(readyKey,new Response(VERSION));
      for (const name of await caches.keys()) if (name.startsWith('monsterbonk-phone-') && name !== CACHE) {
        const old = await caches.open(name);
        if (await old.match(index) || await old.match(readyKey)) await caches.delete(name);
      }
      const content = await caches.open(ASSETS), current = new Set(urls.map(contentKey));
      const prefix = new URL('__asset/',ROOT).href;
      for (const request of await content.keys()) if (request.url.startsWith(prefix) && !current.has(request.url)) await content.delete(request);
      await notify({type:'offline-ready'});
    } catch { await notify({type:'offline-error'}); }
  })().finally(() => { downloading = undefined; if (stopped && !paused) return downloadOffline(); });
  return downloading;
}
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE)));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type === 'pause-offline') { paused = true; event.waitUntil(notify({type:'offline-paused'})); }
  if (event.data?.type === 'download-offline') { paused = false; event.waitUntil(downloadOffline()); }
  if (event.data?.type === 'offline-status') event.waitUntil((async () => {
    const ready = await (await caches.open(CACHE)).match(readyKey);
    event.source?.postMessage({type:ready?'offline-ready':'offline-idle'});
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('range')) return;
  const navigation = request.mode === 'navigate' && (url.pathname === new URL(ROOT).pathname || url.pathname === new URL(index).pathname);
  const key = navigation ? index : url.href;
  if (!hashes.has(key)) return;
  event.respondWith((async () => {
    if (navigation || key === index) {
      try {
        const response = await fetch(request,{cache:'no-cache'});
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache=>cache.put(index,copy)).catch(()=>{})); return response;
        }
      } catch { /* Fall back to the installed document offline. */ }
      const document = await (await caches.open(CACHE)).match(index);
      if (document) return document;
    }
    const cached = await cachedAsset(key); if (cached) return cached;
    const response = await fetch(request);
    event.waitUntil(storeAsset(key,response.clone()).catch(()=>{})); return response;
  })());
});
