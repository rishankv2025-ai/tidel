// Service worker for Tide & Moon.
//
// The point is not the PWA checkbox — it is that the two things a fisherman
// actually needs at the shore keep working with no signal:
//   * tide times, from a cached copy of tidedata.json
//   * moon phase and sun/moon rise-set, which are computed on-device anyway
// Live weather and catch submission need the network and degrade honestly.
//
// Written by hand rather than generated, so there is no precache manifest and
// nothing depends on build-time asset hashes. Everything is runtime-cached.

const VERSION = 'v1'
const SHELL = `shell-${VERSION}`     // navigations + hashed build assets
const DATA = `data-${VERSION}`       // tidedata.json
const RUNTIME = `runtime-${VERSION}` // third-party GETs (weather)

const OFFLINE_URLS = ['/', '/index.html', '/tidedata.json',
  '/icons/icon-192.png', '/manifest.webmanifest']

// The JS and CSS filenames are content-hashed by the build, so they cannot be
// listed here. Discover them by reading index.html at install time.
//
// This matters: without it the first visit fetches the assets BEFORE the worker
// activates, so they are never cached, and the first offline load renders an
// empty page — correct HTML with no app in it. Precaching at install makes
// offline work from the second load rather than the third.
async function assetUrlsFromShell() {
  try {
    const res = await fetch('/index.html', { cache: 'reload' })
    if (!res.ok) return []
    const html = await res.text()
    const urls = new Set()
    // vite emits `./assets/...` because of base:'./' — resolve against the root
    for (const m of html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)) {
      urls.add(new URL(m[1], self.registration.scope).pathname)
    }
    return [...urls]
  } catch { return [] }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL)
    const urls = [...OFFLINE_URLS, ...(await assetUrlsFromShell())]
    // Add individually: addAll rejects the whole install if any single request
    // 404s, and a missing icon must not block the worker.
    // put() under the pathname key, so the fetch handler's pathname lookups hit
    // regardless of how the browser later requests the file (crossorigin module
    // scripts carry different Request properties than a plain fetch).
    await Promise.all(urls.map(async u => {
      try {
        const res = await fetch(new Request(u, { cache: 'reload' }))
        if (res.ok) await cache.put(u, res)
      } catch { /* a missing file must not block install */ }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, DATA, RUNTIME])
    const names = await caches.keys()
    await Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

const isAsset = url => url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only GET is cacheable, and the API must never be cached: a stale catch
  // report or a stale aggregate is worse than an honest failure.
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/.netlify/')) return

  // Navigations: try the network so a deploy is picked up, fall back to the
  // cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        const cache = await caches.open(SHELL)
        cache.put('/index.html', fresh.clone())
        return fresh
      } catch {
        const cache = await caches.open(SHELL)
        return (await cache.match('/index.html')) || (await cache.match('/')) ||
          new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })
      }
    })())
    return
  }

  // Build assets are content-hashed, so a hit is always correct: cache-first.
  //
  // Match on the URL rather than the Request object. Vite emits its module
  // script and stylesheet with `crossorigin`, which gives those page-load
  // requests different mode/credentials than the plain fetch() used to warm the
  // cache — and cache.match(request) then misses, so the asset fell through to
  // the network and the app rendered blank offline. Matching by pathname is
  // immune to that, and safe here precisely because the names are hashed.
  if (url.origin === self.location.origin && isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL)
      const hit = await cache.match(url.pathname, { ignoreVary: true }) ||
        await cache.match(request, { ignoreVary: true }) ||
        await caches.match(url.pathname, { ignoreVary: true })
      if (hit) return hit
      try {
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(url.pathname, fresh.clone())
        return fresh
      } catch (err) {
        // offline with nothing cached: fail loudly rather than hang
        return new Response('', { status: 504, statusText: 'offline, asset not cached' })
      }
    })())
    return
  }

  // Tide data: prefer fresh, but keep the last good copy. This is the file that
  // makes the app useful offline.
  if (url.origin === self.location.origin && url.pathname.endsWith('tidedata.json')) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA)
      try {
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(request, fresh.clone())
        return fresh
      } catch {
        // caches.match searches EVERY cache, not just DATA. Install precaches
        // tidedata.json into SHELL, so a DATA-only lookup missed it and the app
        // came up empty offline — which was the actual offline bug.
        const hit = (await cache.match(request)) || (await caches.match(request)) ||
          (await caches.match('/tidedata.json'))
        if (hit) return hit
        return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } })
      }
    })())
    return
  }

  // Weather (Open-Meteo): network-first, short-lived fallback. Serving a stale
  // forecast is acceptable — the card labels its own timestamp — but never
  // preferred.
  if (/open-meteo\.com$/.test(url.hostname) || /\.open-meteo\.com$/.test(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME)
      try {
        const fresh = await fetch(request)
        if (fresh.ok) cache.put(request, fresh.clone())
        return fresh
      } catch {
        const hit = await cache.match(request)
        if (hit) return hit
        throw new Error('weather unavailable offline')
      }
    })())
  }
})
