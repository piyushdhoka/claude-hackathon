"use client";
//
// HotspotMap — the Leaflet view itself. This component touches `leaflet` directly
// and therefore MUST only ever render on the client. It is loaded via
// MapPanel.tsx with `dynamic(..., { ssr: false })`; never import it from a server
// component.
//
// Layers (all toggleable, see the legend):
//   - zones        : 32 KML zone polygons.
//   - coverage     : zone polygons shaded by CCTV density (cameras / area proxy).
//   - cameras      : individual CCTV points (heavy — off by default).
//   - hotspots     : separation-risk nodes from api.hotspots() (graduated circles).
//   - kiosks       : recommended kiosk sites from api.kiosks() (star markers).
//   - chokepoints  : KML traffic choke points (risk-coloured).
//   - police       : police stations.
//   - landmarks    : ghats / transit hubs.
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Marker,
  Tooltip,
  Popup,
  LayerGroup,
  ScaleControl,
} from "react-leaflet";
import type {
  Feature,
  Geometry,
} from "geojson";
import { api } from "@/lib/api";
import type {
  GeoData,
  Hotspot,
  Kiosk,
  LayerKey,
  ZoneProps,
  ChokepointProps,
} from "./types";
import { MapLegend } from "./MapLegend";

// Nashik / Kumbh bounds — centre the view on the zone cluster.
const DEFAULT_CENTER: [number, number] = [19.997, 73.79];
const DEFAULT_ZOOM = 13;

// --- helpers ---------------------------------------------------------------
function riskColor(risk?: string | null): string {
  switch ((risk || "").toLowerCase()) {
    case "very high":
      return "#be123c";
    case "high":
      return "#ea580c";
    case "medium":
      return "#ca8a04";
    default:
      return "#0f766e";
  }
}

// Coverage shade: more cameras per zone => deeper indigo.
function coverageStyle(count: number, max: number) {
  const t = max > 0 ? count / max : 0;
  // interpolate alpha; low coverage = warm/red tint, high = cool/indigo.
  const hue = 250 - 200 * t; // 50 (amber) .. 250 (indigo)
  return {
    color: `hsl(${hue} 70% 40%)`,
    weight: 1,
    fillColor: `hsl(${hue} 70% 50%)`,
    fillOpacity: 0.25 + 0.35 * t,
  };
}

// Hotspot radius scales with normalised score.
function hotspotRadius(score: number): number {
  return 6 + Math.round(score * 22);
}
function hotspotColor(score: number): string {
  if (score >= 0.66) return "#be123c";
  if (score >= 0.33) return "#ea580c";
  return "#ca8a04";
}

// A small star divIcon for kiosk recommendations.
function kioskIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))">⭐</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}
function dotIcon(emoji: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:16px;line-height:16px">${emoji}</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

interface Props {
  geo: GeoData;
}

export function HotspotMap({ geo }: Props) {
  const [visible, setVisible] = useState<Record<LayerKey, boolean>>({
    zones: true,
    coverage: true,
    cameras: false,
    hotspots: true,
    kiosks: true,
    chokepoints: true,
    police: false,
    landmarks: false,
  });

  const [hotspots, setHotspots] = useState<Hotspot[] | null>(null);
  const [kiosks, setKiosks] = useState<Kiosk[] | null>(null);
  const [apiNote, setApiNote] = useState<string | null>(null);

  // Pull the engine-derived layers; degrade gracefully on 501 / offline.
  useEffect(() => {
    let alive = true;
    (async () => {
      const results = await Promise.allSettled([api.hotspots(), api.kiosks()]);
      if (!alive) return;
      const [h, k] = results;
      if (h.status === "fulfilled") setHotspots(h.value as Hotspot[]);
      else setHotspots([]);
      if (k.status === "fulfilled") setKiosks(k.value as Kiosk[]);
      else setKiosks([]);
      if (h.status === "rejected" || k.status === "rejected") {
        setApiNote(
          "Live separation analytics unavailable (geo engine offline or not yet implemented). Base map layers still shown."
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Max camera count across zones, for coverage shading normalisation.
  const maxCameras = useMemo(() => {
    const feats = geo.zones?.features ?? [];
    return feats.reduce((m, f) => Math.max(m, f.properties.camera_count || 0), 0);
  }, [geo.zones]);

  const toggle = (k: LayerKey) =>
    setVisible((v) => ({ ...v, [k]: !v[k] }));

  return (
    <div className="relative h-[72vh] w-full overflow-hidden rounded-2xl border border-border">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom
        className="h-full w-full"
        style={{ background: "#e9ecef" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ScaleControl position="bottomleft" />

        {/* Zone polygons (plain outline) */}
        {visible.zones && geo.zones && (
          <GeoJSON
            key="zones"
            data={geo.zones}
            style={{
              color: "#4338ca",
              weight: 1.5,
              fillColor: "#6366f1",
              fillOpacity: 0.05,
            }}
            onEachFeature={(f: Feature<Geometry, ZoneProps>, layer) => {
              layer.bindTooltip(
                `${f.properties.name} — ${f.properties.camera_count} cameras`,
                { sticky: true }
              );
            }}
          />
        )}

        {/* CCTV coverage choropleth (zones shaded by camera density) */}
        {visible.coverage && geo.zones && (
          <GeoJSON
            key="coverage"
            data={geo.zones}
            style={(f) =>
              coverageStyle(
                (f as Feature<Geometry, ZoneProps>).properties.camera_count || 0,
                maxCameras
              )
            }
            onEachFeature={(f: Feature<Geometry, ZoneProps>, layer) => {
              const c = f.properties.camera_count || 0;
              layer.bindTooltip(
                `${f.properties.name}: ${c} cameras (${
                  maxCameras ? Math.round((c / maxCameras) * 100) : 0
                }% of busiest zone)`,
                { sticky: true }
              );
            }}
          />
        )}

        {/* Individual cameras (heavy) */}
        {visible.cameras && geo.cameras && (
          <LayerGroup>
            {geo.cameras.features.map((f, i) => {
              const [lng, lat] = f.geometry.coordinates;
              return (
                <CircleMarker
                  key={`cam-${i}`}
                  center={[lat, lng]}
                  radius={2}
                  pathOptions={{
                    color: "#1e3a8a",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.7,
                    weight: 0.5,
                  }}
                />
              );
            })}
          </LayerGroup>
        )}

        {/* Separation-risk hotspots (graduated circles) */}
        {visible.hotspots && hotspots && (
          <LayerGroup>
            {hotspots.map((h, i) => (
              <CircleMarker
                key={`hot-${i}`}
                center={[h.lat, h.lng]}
                radius={hotspotRadius(h.score)}
                pathOptions={{
                  color: hotspotColor(h.score),
                  fillColor: hotspotColor(h.score),
                  fillOpacity: 0.35,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">{h.name}</div>
                    <div>Risk score: {(h.score * 100).toFixed(0)}/100</div>
                    <div>{h.reports} reports nearby</div>
                    {h.category && <div className="text-xs">{h.category}</div>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </LayerGroup>
        )}

        {/* Kiosk recommendations (stars) */}
        {visible.kiosks && kiosks && (
          <LayerGroup>
            {kiosks.map((k, i) => (
              <Marker key={`kiosk-${i}`} position={[k.lat, k.lng]} icon={kioskIcon()}>
                <Popup>
                  <div className="text-sm">
                    <div className="font-semibold">Recommended kiosk</div>
                    <div>{k.name}</div>
                    <div>Priority: {(k.score * 100).toFixed(0)}/100</div>
                    {k.why && <div className="mt-1 text-xs text-stone-600">{k.why}</div>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </LayerGroup>
        )}

        {/* Chokepoints */}
        {visible.chokepoints && geo.chokepoints && (
          <LayerGroup>
            {geo.chokepoints.features.map((f, i) => {
              const [lng, lat] = f.geometry.coordinates;
              const p = f.properties as ChokepointProps;
              return (
                <CircleMarker
                  key={`choke-${i}`}
                  center={[lat, lng]}
                  radius={7}
                  pathOptions={{
                    color: riskColor(p.risk),
                    fillColor: riskColor(p.risk),
                    fillOpacity: 0.6,
                    weight: 1,
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{p.name}</div>
                      {p.risk && <div>Risk: {p.risk}</div>}
                      {p.note && <div className="mt-1 text-xs">{p.note}</div>}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </LayerGroup>
        )}

        {/* Police stations */}
        {visible.police && geo.police && (
          <LayerGroup>
            {geo.police.features.map((f, i) => {
              const [lng, lat] = f.geometry.coordinates;
              return (
                <Marker key={`pol-${i}`} position={[lat, lng]} icon={dotIcon("🚓")}>
                  <Tooltip>{f.properties.name}</Tooltip>
                </Marker>
              );
            })}
          </LayerGroup>
        )}

        {/* Landmarks */}
        {visible.landmarks && geo.landmarks && (
          <LayerGroup>
            {geo.landmarks.features.map((f, i) => {
              const [lng, lat] = f.geometry.coordinates;
              return (
                <Marker key={`lm-${i}`} position={[lat, lng]} icon={dotIcon("📍")}>
                  <Tooltip>{f.properties.name}</Tooltip>
                </Marker>
              );
            })}
          </LayerGroup>
        )}
      </MapContainer>

      <MapLegend
        visible={visible}
        onToggle={toggle}
        hotspotCount={hotspots?.length ?? null}
        kioskCount={kiosks?.length ?? null}
        apiNote={apiNote}
      />
    </div>
  );
}
