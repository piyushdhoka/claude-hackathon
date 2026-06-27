"use client";
//
// MapPanel — client wrapper that (1) loads the local GeoJSON layers from
// /public/geo and (2) dynamically imports the Leaflet map with { ssr: false }.
//
// react-leaflet + leaflet reach for `window`/`document` at import time, so the
// actual map component must never be evaluated on the server. `dynamic(..., {
// ssr: false })` is the supported way to do this in the App Router.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPinned } from "lucide-react";
import type {
  GeoData,
  ZoneFC,
  CameraFC,
  LandmarkFC,
  ChokepointFC,
  PoliceFC,
} from "./types";

// ssr:false — leaflet only works in the browser.
const HotspotMap = dynamic(
  () => import("./HotspotMap").then((m) => m.HotspotMap),
  {
    ssr: false,
    loading: () => <MapSkeleton label="Loading map engine…" />,
  }
);

function MapSkeleton({ label }: { label: string }) {
  return (
    <div className="skeleton grid h-[68dvh] min-h-104 w-full place-items-center rounded-3xl border border-dashed border-border text-muted md:h-[72vh]">
      <div className="flex items-center gap-2 rounded-full bg-surface/80 px-4 py-2 text-sm font-semibold backdrop-blur">
        <Loader2 size={18} className="animate-spin" /> {label}
      </div>
    </div>
  );
}

async function loadJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function MapPanel() {
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [zones, cameras, landmarks, chokepoints, police] = await Promise.all([
        loadJson<ZoneFC>("/geo/zones.json"),
        loadJson<CameraFC>("/geo/cameras.json"),
        loadJson<LandmarkFC>("/geo/landmarks.json"),
        loadJson<ChokepointFC>("/geo/chokepoints.json"),
        loadJson<PoliceFC>("/geo/police.json"),
      ]);
      if (!alive) return;
      if (!zones && !cameras && !chokepoints) {
        setFailed(true);
        return;
      }
      setGeo({ zones, cameras, landmarks, chokepoints, police });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="grid h-[68dvh] min-h-104 w-full place-items-center rounded-3xl border border-dashed border-border bg-surface text-center text-muted md:h-[72vh]">
        <div className="flex flex-col items-center gap-2 p-6">
          <MapPinned size={28} />
          <div className="text-sm">
            Map data unavailable. The geo layers in <code>/public/geo</code> could
            not be loaded.
          </div>
        </div>
      </div>
    );
  }

  if (!geo) return <MapSkeleton label="Loading geo layers…" />;

  return <HotspotMap geo={geo} />;
}

export default MapPanel;
