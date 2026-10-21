// The Cup — offline shell. Lets the app OPEN with no signal. Scores themselves are queued by the app and sent when signal returns.
// Strategy: page = network-first (always the newest version when online, cached copy when not); fonts/icons = cache-first; /api = never cached.
const VERSION = 'cup-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function withTimeout(p, ms) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); }); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;               // live data — the app handles offline itself
  if (url.origin === location.origin && (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html'))) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await withTimeout(fetch(req), 4000);       // slow course signal? fall back to the saved copy after 4s
        if (res && res.ok) cache.put('/', res.clone());
        return res;
      } catch (err) {
        return (await cache.match('/')) || (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }
  const cacheable = url.origin === location.origin || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (cacheable) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }
      catch (err) { return hit || Response.error(); }
    })());
  }
});
