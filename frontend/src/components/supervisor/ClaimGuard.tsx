"use client";
// F6 — Claim-fraud guard. Before revealing any contact, a supervisor can run the
// guard (app/claim): it scores deterministic fraud signals and returns a band.
// A non-clear band blocks auto-reveal and forces a supervisor decision; minors
// always require guardian consent (DPDP §9). Decisions hit the audit trail.
import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, ShieldX, Flag } from "lucide-react";
import { api } from "@/lib/api";
import type { ClaimVerdict } from "@/lib/types";

const BAND = {
  clear: { tone: "teal", icon: ShieldCheck, label: "Clear" },
  review: { tone: "saffron", icon: ShieldAlert, label: "Needs review" },
  block: { tone: "rose", icon: ShieldX, label: "Blocked" },
} as const;

const TONE: Record<string, string> = {
  teal: "border-teal/40 bg-teal/5 text-teal",
  saffron: "border-saffron/40 bg-saffron/10 text-saffron-dark",
  rose: "border-rose/40 bg-rose/5 text-rose",
};

export function ClaimGuard({ caseId }: { caseId: string }) {
  const [verdict, setVerdict] = useState<ClaimVerdict | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      setVerdict(
        await api.assessClaim({
          case_id: caseId,
          claim: { claim_id: `walkin-${Date.now()}`, claimant_id: "walk-in", answers: {} },
          history: [],
        })
      );
    } catch {
      setVerdict(null);
    } finally {
      setLoading(false);
    }
  }

  const b = verdict ? BAND[verdict.band] : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
          <Flag size={14} /> Claim-fraud guard
        </h3>
        <span className="river-rule flex-1" />
      </div>

      {!verdict && (
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-border bg-surface px-4 text-sm font-bold active:scale-95 disabled:opacity-60"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          Run fraud check before reveal
        </button>
      )}

      {verdict && b && (
        <div className={`space-y-2 rounded-2xl border-2 p-4 ${TONE[b.tone]}`}>
          <p className="flex items-center gap-2 font-bold">
            <b.icon size={18} /> {b.label}
            <span className="ml-auto text-xs font-medium">risk {verdict.risk.toFixed(2)}</span>
          </p>
          {verdict.flags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {verdict.flags.map((f) => (
                <li key={f} className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold">
                  {f.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs font-medium text-foreground/70">
            {verdict.allow_auto_reveal
              ? "Auto-reveal permitted."
              : "Auto-reveal blocked — supervisor decision required."}
            {verdict.requires_guardian_consent && " Guardian consent required (minor)."}
          </p>
        </div>
      )}
    </div>
  );
}
