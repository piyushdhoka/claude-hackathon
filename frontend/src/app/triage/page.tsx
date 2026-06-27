"use client";
// F3 — Triage queue. Open cases ranked by vulnerability (unaccompanied child /
// very old, hospital transfer, no reachable contact, night report) with a
// predicted reunion ETA and an SLA-breach flag, so the most at-risk pilgrims are
// worked first. PII masked unless supervisor. Live (operator/supervisor action).
import { useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  ListChecks,
  MapPin,
  Clock,
  TriangleAlert,
  PhoneOff,
} from "lucide-react";
import { useApp } from "@/store/app";
import { api } from "@/lib/api";
import type { TriageItem } from "@/lib/types";

function riskTone(v: number): { bar: string; label: string } {
  if (v >= 0.8) return { bar: "bg-rose", label: "Critical" };
  if (v >= 0.5) return { bar: "bg-saffron", label: "High" };
  if (v >= 0.3) return { bar: "bg-indigo", label: "Moderate" };
  return { bar: "bg-teal", label: "Low" };
}

export default function TriagePage() {
  const { role } = useApp();
  const [items, setItems] = useState<TriageItem[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setErr(false);
    api
      .triageQueue({ limit: 200 }, role)
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && (setItems([]), setErr(true)));
    return () => {
      cancelled = true;
    };
  }, [role]);

  return (
    <div className="space-y-5">
      <header className="animate-rise">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose/12 text-rose">
              <ListChecks size={20} />
            </span>
            Triage queue
          </h1>
          <span className="river-rule hidden flex-1 sm:block" />
        </div>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Open cases ordered by <b>vulnerability</b>, each with a predicted reunion time. Red
          flags breach the service-level target — escalate first.
        </p>
      </header>

      {err && (
        <p className="flex items-center gap-2 rounded-xl bg-saffron/12 p-3 text-sm font-medium text-saffron-dark">
          <AlertTriangle size={16} className="shrink-0" /> Could not reach the backend
          (127.0.0.1:8000). The triage queue is a live view.
        </p>
      )}

      {items == null ? (
        <p className="flex items-center gap-2 p-4 text-muted">
          <Loader2 size={16} className="animate-spin" /> Ranking open cases…
        </p>
      ) : items.length === 0 && !err ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-muted">
          No open cases — every reported pilgrim is resolved.
        </p>
      ) : (
        <ol className="space-y-2.5 stagger">
          {items.map((c, i) => {
            const tone = riskTone(c.vulnerability);
            return (
              <li
                key={c.case_id}
                className={`rounded-2xl border-2 bg-surface p-4 shadow-sm ${
                  c.sla_breach ? "border-rose/50 ring-2 ring-rose/15" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-bold text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="truncate text-base font-bold">
                        {c.name || "Unnamed person"}
                      </h2>
                      <span className="text-sm text-muted">
                        {c.gender} · {c.age_band}
                      </span>
                      <span className="font-mono text-xs text-muted">{c.case_id}</span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                      {c.last_seen_location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} /> {c.last_seen_location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={13} /> ETA{" "}
                        {c.eta_hours != null ? `~${c.eta_hours.toFixed(1)}h` : "—"}
                      </span>
                      {!c.mobile && (
                        <span className="inline-flex items-center gap-1 text-rose">
                          <PhoneOff size={13} /> no contact
                        </span>
                      )}
                      {c.status === "Transferred to hospital" && (
                        <span className="rounded-full bg-rose/10 px-2 py-0.5 text-xs font-bold text-rose">
                          hospital
                        </span>
                      )}
                    </p>

                    {/* vulnerability bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={`h-full rounded-full ${tone.bar}`}
                          style={{ width: `${Math.round(c.vulnerability * 100)}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs font-bold text-muted">
                        {tone.label}
                      </span>
                    </div>
                  </div>

                  {c.sla_breach && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose/10 px-2.5 py-1 text-xs font-bold text-rose">
                      <TriangleAlert size={13} /> SLA
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
