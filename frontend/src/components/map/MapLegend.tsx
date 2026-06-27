"use client";
//
// Legend + layer toggles for the hotspot map. Responsive:
//   - mobile : a pull-up BOTTOM SHEET (thumb-reachable) with a grab handle.
//   - >=sm   : a floating card pinned to the top-right of the map.
// Pure presentational; the parent owns the `visible` state.
import { useState } from "react";
import { Layers, ChevronDown, AlertTriangle, X } from "lucide-react";
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

export function MapLegend({ visible, onToggle, hotspotCount, kioskCount, apiNote }: Props) {
  // Desktop card open state, mobile sheet open state — independent.
  const [open, setOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const count = (k: LayerKey): string => {
    if (k === "hotspots" && hotspotCount != null) return ` (${hotspotCount})`;
    if (k === "kiosks" && kioskCount != null) return ` (${kioskCount})`;
    return "";
  };
  const activeCount = Object.values(visible).filter(Boolean).length;

  const Body = (
    <>
      <ul className="grid grid-cols-1 gap-1.5 sm:block sm:space-y-1.5">
        {ITEMS.map((it) => (
          <li key={it.key}>
            <label
              className={clsx(
                "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition sm:min-h-0 sm:px-0 sm:py-0",
                visible[it.key] ? "bg-saffron/8 sm:bg-transparent" : "hover:bg-surface-2 sm:hover:bg-transparent"
              )}
            >
              <input
                type="checkbox"
                checked={visible[it.key]}
                onChange={() => onToggle(it.key)}
                className="h-5 w-5 accent-saffron sm:h-4 sm:w-4"
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
        <div className="mb-1 text-[11px] font-semibold text-muted">Separation risk</div>
        <div className="flex items-center gap-1 text-[11px] text-muted">
          <span className="h-3 w-3 rounded-full" style={{ background: "#ca8a04" }} /> low
          <span className="ml-1 h-3 w-3 rounded-full" style={{ background: "#ea580c" }} /> med
          <span className="ml-1 h-3 w-3 rounded-full" style={{ background: "#be123c" }} /> high
        </div>
      </div>

      {apiNote && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-rose/10 p-2 text-[11px] text-rose">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{apiNote}</span>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* ── Desktop: floating card (top-right) ───────────────────────── */}
      <div className="pointer-events-auto absolute right-3 top-3 z-[1000] hidden w-60 max-w-[80vw] rounded-xl border border-border bg-surface/95 text-sm shadow-lg backdrop-blur sm:block">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-t-xl px-3 py-2 font-semibold"
        >
          <span className="flex items-center gap-2">
            <Layers size={16} /> Map layers
          </span>
          <ChevronDown size={16} className={clsx("transition", !open && "-rotate-90")} />
        </button>
        {open && <div className="px-3 pb-3">{Body}</div>}
      </div>

      {/* ── Mobile: trigger button + bottom sheet ────────────────────── */}
      <button
        onClick={() => setSheetOpen(true)}
        className="pointer-events-auto absolute right-3 top-3 z-[1000] inline-flex items-center gap-2 rounded-full border border-border bg-surface/95 px-4 py-2.5 text-sm font-bold shadow-lg backdrop-blur active:scale-95 sm:hidden"
      >
        <Layers size={16} /> Layers
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-saffron px-1 text-[11px] font-bold text-white">
          {activeCount}
        </span>
      </button>

      {sheetOpen && (
        <div className="absolute inset-0 z-[1100] sm:hidden">
          {/* scrim */}
          <button
            aria-label="Close layers"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px] animate-fade"
          />
          {/* sheet */}
          <div className="absolute inset-x-0 bottom-0 max-h-[75%] overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-4 shadow-lg animate-rise">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Layers size={18} /> Map layers
              </h3>
              <button
                onClick={() => setSheetOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted active:scale-95"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="text-sm">{Body}</div>
          </div>
        </div>
      )}
    </>
  );
}
