"use client";
// Supervisor console. Human-in-the-loop only — nothing auto-confirms.
//   - pick a case, see ranked candidates (MatchCard) and CONFIRM a match
//     (submits a match.confirmed event via the offline-first write-path)
//   - REVEAL contact: re-fetch as supervisor so the mobile unmasks (logged-feeling)
//   - DUPLICATE review (api.dedupe)
//   - PHOTO COMPARE (api.comparePhotos) — assistive "same person?" second opinion
//   - AUDIT trail (api.getAudit)
// Data calls here are intentionally live (supervisor actions need the backend for
// PII + the audit log); they are unchanged from the wired contract.
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ShieldCheck,
  User,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Info,
  ArrowLeft,
  Building2,
} from "lucide-react";
import { useApp } from "@/store/app";
import { api } from "@/lib/api";
import type { Case, MatchCandidate } from "@/lib/types";
import { CaseFilters, CaseList } from "@/components/review/CaseList";
import { MatchCard } from "@/components/review/MatchCard";
import { RevealContact } from "@/components/supervisor/RevealContact";
import { AuditTrail } from "@/components/supervisor/AuditTrail";
import { DuplicateReview } from "@/components/supervisor/DuplicateReview";
import { PhotoCompare } from "@/components/supervisor/PhotoCompare";
import { confirmMatch, purgeCase } from "@/components/supervisor/confirmEvent";
import { ClaimGuard } from "@/components/supervisor/ClaimGuard";
import { ReunionActions } from "@/components/supervisor/ReunionActions";

export default function SupervisorPage() {
  const { role, language, setRole } = useApp();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [filter, setFilter] = useState({ case_type: "", q: "" });

  const [selected, setSelected] = useState<Case | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [matching, setMatching] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ matchedId: string; queued: boolean } | null>(null);
  const [purging, setPurging] = useState(false);
  const [purged, setPurged] = useState(false);

  const isSupervisor = role === "supervisor";

  const load = useCallback(() => {
    setCases(null);
    api
      .listCases({ limit: 100 }, "supervisor")
      .then(setCases)
      .catch(() => {
        setCases([]);
        setLoadErr(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pick = useCallback(async (c: Case) => {
    setSelected(c);
    setConfirmed(null);
    setMatches(null);
    setMatching(true);
    const target = c.case_type === "missing" ? "found" : "missing";
    try {
      setMatches(await api.match(c, target, 5));
    } catch {
      setMatches([]);
    } finally {
      setMatching(false);
    }
  }, []);

  const onConfirm = useCallback(
    async (cand: MatchCandidate) => {
      if (!selected) return;
      setConfirmingId(cand.case_id);
      setPurged(false);
      const res = await confirmMatch(selected.case_id, cand.case_id, "supervisor");
      setConfirmed({ matchedId: cand.case_id, queued: res.queued || !res.delivered });
      setConfirmingId(null);
    },
    [selected]
  );

  const onPurge = useCallback(async () => {
    if (!selected || !confirmed) return;
    setPurging(true);
    await purgeCase(selected.case_id, confirmed.matchedId, "supervisor");
    setPurged(true);
    setPurging(false);
    load(); // refresh so the now-redacted record is reflected
  }, [selected, confirmed, load]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo/12 text-indigo">
              <ShieldCheck size={20} />
            </span>
            Supervisor console
          </h1>
          <p className="mt-1 text-sm text-muted sm:text-base">
            Confirm matches, reveal protected contacts, review duplicates, and inspect the
            audit trail. Every confirmation is a human decision.
          </p>
        </div>
        {!isSupervisor && (
          <button
            type="button"
            onClick={() => setRole("supervisor")}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo px-4 py-2.5 text-sm font-bold text-white shadow-sm active:scale-95"
          >
            <ShieldCheck size={16} /> Switch to supervisor
          </button>
        )}
      </header>

      {!isSupervisor && (
        <p className="flex items-center gap-2 rounded-xl bg-indigo/10 p-3 text-sm text-indigo">
          <Info size={16} className="shrink-0" /> You are in <b>operator</b> role. Contact reveal
          requires supervisor role — switch above to unmask PII.
        </p>
      )}

      {loadErr && (
        <p className="flex items-center gap-2 rounded-xl bg-saffron/12 p-3 text-sm font-medium text-saffron-dark">
          <AlertTriangle size={16} className="shrink-0" /> Could not reach the registry (backend at
          127.0.0.1:8000). Supervisor actions need the live backend.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        {/* left: case picker */}
        <aside className={selected ? "hidden lg:block" : "block"}>
          <div className="space-y-3 lg:sticky lg:top-20">
            <CaseFilters value={filter} onChange={setFilter} />
            {cases == null ? (
              <p className="flex items-center gap-2 p-4 text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </p>
            ) : (
              <CaseList cases={cases} selectedId={selected?.case_id} onSelect={pick} filter={filter} />
            )}
          </div>
        </aside>

        {/* right: workspace */}
        <section className="space-y-5">
          {!selected && (
            <div className="grid place-items-center rounded-3xl border-2 border-dashed border-border bg-surface p-10 text-center text-muted sm:p-12">
              <ShieldCheck size={32} className="mb-2 text-indigo/50" />
              Select a case to review.
            </div>
          )}

          {selected && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setMatches(null);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-foreground/80 active:scale-95 lg:hidden"
              >
                <ArrowLeft size={16} /> Back to cases
              </button>

              {/* case header + reveal contact */}
              <div className="space-y-4 rounded-3xl border-2 border-border bg-surface p-5 shadow-sm animate-rise">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white ${
                      selected.case_type === "found" ? "bg-teal" : "bg-rose"
                    }`}
                  >
                    <User size={22} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold">
                      {selected.name || "Unnamed person"}{" "}
                      <span className="text-sm font-medium text-muted">({selected.case_type})</span>
                    </h2>
                    <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
                      <span>
                        {selected.gender} · {selected.age_band}
                      </span>
                      {selected.last_seen_location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} /> {selected.last_seen_location}
                        </span>
                      )}
                      <span className="font-mono text-xs">{selected.case_id}</span>
                    </p>
                    {selected.reporting_center && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-foreground/70">
                        <Building2 size={12} /> {selected.reporting_center}
                      </p>
                    )}
                  </div>
                </div>

                {isSupervisor ? (
                  <>
                    {/* F6 — gate the reveal with the claim-fraud guard */}
                    <ClaimGuard caseId={selected.case_id} />
                    <RevealContact caseId={selected.case_id} masked={selected.mobile} />
                  </>
                ) : (
                  <p className="rounded-2xl border-2 border-border bg-surface-2/60 p-4 text-sm text-muted">
                    Contact: <span className="font-mono">{selected.mobile ?? "—"}</span> (masked —
                    supervisor role required to reveal).
                  </p>
                )}
              </div>

              {confirmed && (
                <div className="space-y-3 rounded-2xl border-2 border-teal/40 bg-teal/5 p-4 animate-pop">
                  <div className="flex items-center gap-2 text-teal">
                    <CheckCircle2 size={20} className="shrink-0" />
                    <span className="font-semibold">
                      Reunited with <span className="font-mono">{confirmed.matchedId}</span>.
                      {confirmed.queued && " (queued — will sync when online)"}
                    </span>
                  </div>

                  {/* F5 handoff routing + F1 notify family */}
                  <ReunionActions caseDoc={selected} />

                  {/* Privacy by design: purge PII once the person is reunited. */}
                  {!purged ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm text-muted">
                        Both cases are closed. Purge personal data (name, contact, photo,
                        description) now that they are no longer needed.
                      </p>
                      <button
                        type="button"
                        onClick={onPurge}
                        disabled={purging}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose px-4 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-60"
                      >
                        {purging ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                        Purge personal data
                      </button>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 text-sm font-semibold text-rose">
                      <ShieldCheck size={15} /> Personal data purged — only an anonymized,
                      auditable record remains.
                    </p>
                  )}
                </div>
              )}

              {/* candidate matches with confirm */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
                    Candidate matches
                  </h3>
                  <span className="river-rule flex-1" />
                </div>
                {matching && (
                  <p className="flex items-center gap-2 text-muted">
                    <Loader2 size={18} className="animate-spin" /> Finding matches…
                  </p>
                )}
                {!matching && matches && matches.length === 0 && (
                  <p className="rounded-2xl border border-border bg-surface p-5 text-muted">
                    No candidates returned.
                  </p>
                )}
                {matches?.map((c, i) => (
                  <MatchCard
                    key={c.case_id}
                    candidate={c}
                    query={selected}
                    queryCenter={selected.reporting_center}
                    language={language}
                    rank={i + 1}
                    defaultOpen={i === 0}
                    onConfirm={isSupervisor ? onConfirm : undefined}
                    confirming={confirmingId === c.case_id}
                    confirmLabel="Confirm this match"
                  />
                ))}
              </div>

              {/* photo compare (assistive second opinion) */}
              <div className="rounded-3xl border-2 border-border bg-surface p-5">
                <PhotoCompare language={language} />
              </div>

              {/* duplicate review + audit */}
              <div className="rounded-3xl border-2 border-border bg-surface p-5">
                <DuplicateReview caseDoc={selected} language={language} />
              </div>
              <div className="rounded-3xl border-2 border-border bg-surface p-5">
                <AuditTrail caseId={selected.case_id} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
