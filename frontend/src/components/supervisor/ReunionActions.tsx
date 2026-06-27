"use client";
// F5 + F1 — shown once a match is confirmed.
//   F5 Reunion handoff: nearest police station / help center to route the family
//      to (distance + compass heading), from app/geo/route.py.
//   F1 Notify family: send the reporter a localized found-safe SMS/IVR with a
//      claim code (app/notify). The raw number is never shown — only a masked form.
import { useCallback, useEffect, useState } from "react";
import { Loader2, Navigation, Send, Phone, ShieldCheck, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import type { Case, HandoffResult, NotifyResult } from "@/lib/types";

export function ReunionActions({ caseDoc }: { caseDoc: Case }) {
  const [handoff, setHandoff] = useState<HandoffResult | null>(null);
  const [notif, setNotif] = useState<NotifyResult | null>(null);
  const [notifying, setNotifying] = useState(false);

  useEffect(() => {
    if (!caseDoc.last_seen_location) return;
    let cancelled = false;
    api
      .handoff(caseDoc.last_seen_location)
      .then((r) => !cancelled && setHandoff(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [caseDoc.last_seen_location]);

  const notify = useCallback(async () => {
    setNotifying(true);
    try {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      setNotif(
        await api.notifyMatch({
          case_id: caseDoc.case_id,
          center: caseDoc.reporting_center,
          code,
        })
      );
    } catch {
      setNotif({ sent: false, reason: "unreachable", masked_to: null });
    } finally {
      setNotifying(false);
    }
  }, [caseDoc]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* F5 — handoff routing */}
      <div className="rounded-2xl border-2 border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          <Navigation size={13} /> Route family to
        </p>
        {handoff ? (
          <>
            <p className="mt-1 font-bold">{handoff.destination.name}</p>
            <p className="text-xs capitalize text-muted">
              {handoff.destination.kind} · {Math.round(handoff.destination.distance_m)} m ·
              head {handoff.destination.heading}
            </p>
            <ul className="mt-2 space-y-1">
              {handoff.options.slice(1).map((o) => (
                <li key={o.name} className="flex items-center gap-1.5 text-xs text-muted">
                  <MapPin size={11} /> {o.name} · {Math.round(o.distance_m)} m
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {caseDoc.last_seen_location ? "Finding nearest help point…" : "No location on file."}
          </p>
        )}
      </div>

      {/* F1 — notify family */}
      <div className="rounded-2xl border-2 border-border bg-surface p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          <Phone size={13} /> Notify family
        </p>
        {notif?.sent ? (
          <div className="mt-1 space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-teal">
              <ShieldCheck size={14} /> Sent to {notif.masked_to} ({notif.channel})
            </p>
            <p className="rounded-xl bg-surface-2 p-2 text-xs leading-relaxed text-foreground/80">
              {notif.message}
            </p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              {notif && !notif.sent
                ? `Not sent (${notif.reason}).`
                : "Send a localized found-safe message + claim code. Number stays masked."}
            </p>
            <button
              type="button"
              onClick={notify}
              disabled={notifying}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo px-4 text-sm font-bold text-white active:scale-95 disabled:opacity-60"
            >
              {notifying ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Send SMS / IVR
            </button>
          </>
        )}
      </div>
    </div>
  );
}
