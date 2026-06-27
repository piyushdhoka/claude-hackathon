"use client";
//
// Hotspot map page. Renders the Leaflet panel (zones, CCTV coverage, separation
// hotspots, kiosk recommendations, choke points, police, landmarks) plus the
// offline sync wiring this agent owns:
//   - <SwRegistrar/>  registers the service worker (offline shell boot).
//   - <SyncProvider/> drains the outbox on reconnect (pulls cases into the mirror).
//   - <SyncBadge/>    shows online/pending state (the frozen Nav can't).
import { MapPanel } from "@/components/map/MapPanel";
import {
  SwRegistrar,
  SyncProvider,
  SyncBadge,
} from "@/lib/offline/SyncProvider";

export default function MapPage() {
  return (
    <div className="space-y-4">
      <SwRegistrar />
      <SyncProvider pullOnMount />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hotspot map</h1>
          <p className="text-sm text-muted">
            Where pilgrims get separated, where coverage is thin, and where to put
            the next help kiosk.
          </p>
        </div>
        <SyncBadge />
      </div>

      <MapPanel />

      <p className="text-xs text-muted">
        Base layers (zones, cameras, choke points, police, landmarks) load from the
        on-device <code>/geo</code> bundle and work offline. Separation hotspots and
        kiosk recommendations come from the geo engine when reachable.
      </p>
    </div>
  );
}
