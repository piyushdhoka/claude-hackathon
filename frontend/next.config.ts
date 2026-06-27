import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root (multiple lockfiles exist on this machine).
  turbopack: {
    root: __dirname,
  },
  // NOTE: the offline+map agent wires Serwist (PWA/service worker) here via
  // withSerwist(...). Keep this `turbopack.root` when doing so.
};

export default nextConfig;
