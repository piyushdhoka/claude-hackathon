import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root (multiple lockfiles exist on this machine).
  turbopack: {
    root: __dirname,
  },

  // PWA / service-worker headers. The worker itself is the hand-written
  // public/sw.js (see note below); these headers make sure the browser always
  // re-validates it and never serves a stale worker, and tighten a few defaults.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// --- Serwist (optional) ---------------------------------------------------
// The intended PWA wiring is @serwist/next's withSerwist(), pointing at
// src/app/sw.ts. However, @serwist/next injects its precache manifest via a
// *webpack* plugin that only runs during `next build`. This project runs on
// Turbopack with a pinned `turbopack.root` that is shared with another agent,
// and we are explicitly told NOT to run `next build`/`next dev` here (concurrent
// builds corrupt the shared .next). Under those constraints the Serwist plugin
// would be inert (no SW emitted), so we ship a dependency-free hand-written
// worker (public/sw.js) registered by <SwRegistrar/> instead.
//
// The wiring is kept here, guarded behind SERWIST=1, so it can be switched on in
// a non-shared/production build without changing app code. Turning it on swaps
// the registered worker to the compiled src/app/sw.ts output.
let exported: NextConfig = nextConfig;
if (process.env.SERWIST === "1") {
  // Lazy require so the dependency is only touched when explicitly enabled.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withSerwist = require("@serwist/next").default({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
    cacheOnNavigation: true,
    reloadOnOnline: true,
    register: false, // we register manually via <SwRegistrar/>
  });
  exported = withSerwist(nextConfig);
}

export default exported;
