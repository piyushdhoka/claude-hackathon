/* Setu service worker (hand-written fallback).
 *
 * WHY hand-written instead of the Serwist build plugin: this repo runs Next.js 16
 * with Turbopack (`turbopack.root` is pinned and shared with another agent). The
 * @serwist/next plugin injects its precache manifest through a *webpack* plugin
 * that only runs during `next build` — which we must not run here (concurrent
 * builds corrupt the shared .next). A small, dependency-free worker gives us the
 * thing that actually matters on snan days: the app shell boots with no network,
 * and GETs are served stale-while-revalidate. The Dexie outbox (see lib/offline)
 * handles durable writes + sync; the SW only handles read caching of the shell.
 *
 * Strategy:
 *   - precache the app shell + offline fallback on install.
 *   - navigations: network-first, fall back to cache, then to "/" (offline shell).
 *   - same-origin static assets (_next, geo, icons, css/js): stale-while-revalidate.
 *   - API calls (the backend) are NEVER cached — writes go through the outbox and
 *     reads should reflect live data when online; offline reads use Dexie.
 */
const VERSION = "setu-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Routes that make up the bootable shell. Next renders these client-side once the
// JS chunks are cached, so caching the HTML entry points + manifest is enough to
// open the console offline.
const SHELL_URLS = [
  "/",
  "/intake",
  "/review",
  "/map",
  "/supervisor",
  "/manifest.webmanifest",
  "/offline.html",
];

// Local geo layers powering the map should be available offline too.
const GEO_URLS = [
  "/geo/zones.json",
  "/geo/cameras.json",
  "/geo/landmarks.json",
  "/geo/chokepoints.json",
  "/geo/police.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic-ish; if one URL 404s it rejects, so add resiliently.
      await Promise.allSettled(
        [...SHELL_URLS, ...GEO_URLS].map((url) =>
          cache.add(new Request(url, { cache: "reload" }))
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  // Backend lives on :8000 (or NEXT_PUBLIC_API_URL). Treat any cross-origin or
  // /registry|/match|/geo/hotspots|/enrich|/face path as live API — never cache.
  if (url.origin !== self.location.origin) return true;
  return /^\/(registry|match|enrich|face)\b/.test(url.pathname) ||
    /^\/geo\/(hotspots|kiosks)\b/.test(url.pathname);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      (await cache.match("/offline.html")) ||
      Response.error()
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes never go through the SW

  const url = new URL(request.url);
  if (isApiRequest(url)) return; // let the network/Dexie layer handle it

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Same-origin static assets.
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Allow the page to ask the SW to activate immediately after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
