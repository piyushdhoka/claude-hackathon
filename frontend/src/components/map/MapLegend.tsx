"use client";
//
// Floating legend + layer toggles for the hotspot map. Pure presentational; the
// parent owns the `visible` state.
import { useState } from "react";
import { Layers, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import type { LayerKey } from "./types";

interface LegendItem {
  key: LayerKey;
  label: string;
  swatch: React.ReactNode;
}

function Swatch({ color, ring }: { color: string; ring?: boolean }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-sm"
      style={{
        background: color,
        outline: ring ? "1px solid rgba(0,0,0,.25)" : undefined,
      }}
    />
  );
}

const ITEMS: LegendItem[] = [
  { key: "zones", label: "Zones", swatch: <Swatch color="#6366f1" /> },
  { key: "coverage", label: "CCTV coverage", swatch: <Swatch color="#4338ca" /> },
  { key: "cameras", label: "Cameras (all)", swatch: <Swatch color="#3b82f6" /> },
  { key: "hotspots", label: "Separation hotspots", swatch: <Swatch color="#be123c" /> },
  { key: "kiosks", label: "Kiosk recommendations", swatch: <span className="text-sm leading-none">⭐</span> },
  { key: "chokepoints", label: "Choke points", swatch: <Swatch color="#ea580c" /> },
  { key: "police", label: "Police stations", swatch: <span className="text-sm leading-none">🚓</span> },
  { key: "landmarks", label: "Landmarks / ghats", swatch: <span className="text-sm leading-none">📍</span> },
];

interface Props {
  visible: Record<LayerKey, boolean>;
  onToggle: (k: LayerKey) => void;
  hotspotCount: number | null;
  kioskCount: number | null;
  apiNote: string | null;
}

export function MapLegend({
  visible,
  onToggle,
  hotspotCount,
  kioskCount,
  apiNote,
}: Props) {
  const [open, setOpen] = useState(true);

  const count = (k: LayerKey): string => {
    if (k === "hotspots" && hotspotCount != null) return ` (${hotspotCount})`;
    if (k === "kiosks" && kioskCount != null) return ` (${kioskCount})`;
    return "";
  };

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-[1000] w-60 max-w-[80vw] rounded-xl border border-border bg-card/95 text-sm shadow-lg backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-t-xl px-3 py-2 font-semibold"
      >
        <span className="flex items-center gap-2">
          <Layers size={16} /> Map layers
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="px-3 pb-3">
          <ul className="space-y-1.5">
            {ITEMS.map((it) => (
              <li key={it.key}>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={visible[it.key]}
                    onChange={() => onToggle(it.key)}
                    className="h-4 w-4 accent-saffron"
                  />
                  <span className="flex w-4 justify-center">{it.swatch}</span>
                  <span className="text-foreground">
                    {it.label}
                    <span className="text-muted">{count(it.key)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {/* Hotspot intensity legend */}
          <div className="mt-3 border-t border-border pt-2">
            <div className="mb-1 text-[11px] font-semibold text-muted">
              Separation risk
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted">
              <span className="h-3 w-3 rounded-full" style={{ background: "#ca8a04" }} />
              low
              <span className="ml-1 h-3 w-3 rounded-full" style={{ background: "#ea580c" }} />
              med
              <span className="ml-1 h-3 w-3 rounded-full" style={{ background: "#be123c" }} />
              high
            </div>
          </div>

          {apiNote && (
            <div
              className={clsx(
                "mt-3 flex items-start gap-1.5 rounded-lg bg-rose/10 p-2 text-[11px] text-rose"
              )}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{apiNote}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
