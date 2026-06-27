"use client";
//
// Hotspot map page. Renders the Leaflet panel (zones, CCTV coverage, separation
// hotspots, kiosk recommendations, choke points, police, landmarks).
//
// The global sync engine + service worker are mounted once in the Nav TopBar, so
// here we only opt into a mirror warm-pull (pullOnMount) so the registry is
// browsable offline later.
import { MapPanel } from "@/components/map/MapPanel";
import { SyncProvider, SyncBadge } from "@/lib/offline/SyncProvider";
import { Layers, Hand } from "lucide-react";

export default function MapPage() {
  return (
    <div className="space-y-4">
      {/* Warm the offline mirror so the registry is browsable on snan days. */}
      <SyncProvider pullOnMount />

      <header className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Hotspot map
            </h1>
            <span className="river-rule hidden w-24 sm:block" />
          </div>
          <p className="mt-1 text-sm text-muted">
            Where pilgrims get separated, where CCTV coverage is thin, and where to put the
            next help kiosk.
          </p>
        </div>
        <SyncBadge />
      </header>

      <MapPanel />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Layers size={13} /> Tap <b className="text-foreground/80">Layers</b> to toggle what
          you see.
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Hand size={13} /> Base layers load from the on-device <code>/geo</code> bundle and
          work offline.
        </span>
      </div>
    </div>
  );
}
