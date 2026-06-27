/// <reference lib="webworker" />
//
// Serwist service-worker entry (the "intended" PWA wiring).
//
// This file is compiled by @serwist/next's `withSerwist()` (enabled with
// SERWIST=1 in next.config.ts). At build time Serwist replaces `self.__SW_MANIFEST`
// with the precache manifest (the hashed app-shell + static assets), giving us a
// proper offline boot + stale-while-revalidate runtime caching.
//
// IMPORTANT: in this shared repo we run on Turbopack and must not run `next build`,
// so by default the dependency-free `public/sw.js` is the worker that actually
// ships (see next.config.ts for the full rationale). This entry exists so the PWA
// can be switched to Serwist in a standalone/production build without touching app
// code — it mirrors the same shell-first behaviour as public/sw.js.

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by Serwist at build time.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Next.js-tuned runtime caching (RSC, pages, static, fonts, images ...).
  runtimeCaching: defaultCache,
  // Offline navigation fallback to the precached shell entry.
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
