"use client";
// F2 — CCTV search corridor. Enter a last-seen location; get the ranked list of
// nearby cameras a control-room operator should review first, biased along the
// direction a separated elder/child drifts (toward the nearest exit / parking).
// No footage in the dataset — this orders WHERE to look, it does not analyse video.
import { useState } from "react";
import { Loader2, Camera, Compass, Search, MapPin, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { CorridorResult } from "@/lib/types";

const QUICK = [
  "Ramkund Ghat",
  "Panchavati Circle",
  "Madsangvi Transit",
  "Trimbakeshwar Approach",
  "Nashik Road Station",
];

export default function CorridorPage() {
  const [location, setLocation] = useState("");
  const [result, setResult] = useState<CorridorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(loc: string) {
    const q = loc.trim();
    if (!q) return;
    setLocation(q);
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await api.corridor(q, 2000, 15));
    } catch {
      setErr(`No cameras found near "${q}". Try a known landmark.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="animate-rise">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal/12 text-teal">
              <Camera size={20} />
            </span>
            CCTV search corridor
          </h1>
          <span className="river-rule hidden flex-1 sm:block" />
        </div>
        <p className="mt-1 text-sm text-muted sm:text-base">
          From a last-seen point, a ranked camera review list — weighted along the likely
          drift toward the nearest exit.
        </p>
      </header>

      {/* search */}
      <div className="rounded-3xl border-2 border-border bg-surface p-4 shadow-sm">
        <div className="flex gap-2">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(location)}
            placeholder="Last-seen location, e.g. Ramkund Ghat"
            className="min-h-12 flex-1 rounded-2xl border-2 border-border bg-surface px-4 text-base outline-none focus:border-teal"
          />
          <button
            type="button"
            onClick={() => run(location)}
            disabled={loading}
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-teal px-5 font-bold text-white active:scale-95 disabled:opacity-60"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            Search
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => run(q)}
              className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground/80 active:scale-95"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <p className="rounded-xl bg-saffron/12 p-3 text-sm font-medium text-saffron-dark">{err}</p>
      )}

      {result && (
        <>
          {/* origin + drift */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border-2 border-border bg-surface p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Origin</p>
              <p className="mt-1 flex items-center gap-1.5 font-bold">
                <MapPin size={15} className="text-teal" />
                {result.origin.last_seen_location}
              </p>
              <p className="text-xs text-muted">
                {result.origin.zone_id ?? "—"} · {result.origin.lat.toFixed(4)},{" "}
                {result.origin.lng.toFixed(4)}
              </p>
            </div>
            <div className="rounded-2xl border-2 border-indigo/30 bg-indigo/5 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo">
                <Compass size={13} /> Likely drift toward
              </p>
              {result.drift_target ? (
                <>
                  <p className="mt-1 font-bold">{result.drift_target.name}</p>
                  <p className="text-xs capitalize text-muted">{result.drift_target.category}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">No nearby exit node.</p>
              )}
            </div>
          </div>

          {/* camera worklist */}
          <div>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                Camera review order · {result.cameras.length}
              </h2>
              <span className="river-rule flex-1" />
            </div>
            <ol className="space-y-2 stagger">
              {result.cameras.map((cam, i) => (
                <li
                  key={cam.camera_id}
                  className={`flex items-center gap-3 rounded-2xl border-2 bg-surface p-3 ${
                    cam.on_corridor ? "border-indigo/40 ring-1 ring-indigo/15" : "border-border"
                  }`}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-muted">
                    {i + 1}
                  </span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal/12 text-teal">
                    <Camera size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-bold">{cam.camera_id}</p>
                    <p className="text-xs text-muted">{Math.round(cam.distance_m)} m away</p>
                  </div>
                  {cam.on_corridor && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo/10 px-2.5 py-1 text-xs font-bold text-indigo">
                      <ArrowRight size={12} /> on drift path
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
