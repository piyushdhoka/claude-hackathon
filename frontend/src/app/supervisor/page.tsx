"use client";
// Supervisor console. Human-in-the-loop only — nothing auto-confirms.
//   - pick a case, see ranked candidates (MatchCard) and CONFIRM a match
//     (submits a match.confirmed event)
//   - REVEAL contact: re-fetch as supervisor so the mobile unmasks (logged-feeling)
//   - DUPLICATE review (api.dedupe)
//   - AUDIT trail (api.getAudit)
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ShieldCheck,
  User,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useApp } from "@/store/app";
import { api } from "@/lib/api";
import type { Case, MatchCandidate } from "@/lib/types";
import { CaseFilters, CaseList } from "@/components/review/CaseList";
import { MatchCard } from "@/components/review/MatchCard";
import { RevealContact } from "@/components/supervisor/RevealContact";
import { AuditTrail } from "@/components/supervisor/AuditTrail";
import { DuplicateReview } from "@/components/supervisor/DuplicateReview";
import { confirmMatch } from "@/components/supervisor/confirmEvent";

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
      const res = await confirmMatch(selected.case_id, cand.case_id, "supervisor");
      setConfirmed({ matchedId: cand.case_id, queued: res.queued || !res.delivered });
      setConfirmingId(null);
    },
    [selected]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <ShieldCheck className="text-indigo" /> Supervisor console
          </h1>
          <p className="text-muted">
            Confirm matches, reveal protected contacts, review duplicates, and inspect the audit
            trail. Every confirmation is a human decision.
          </p>
        </div>
        {!isSupervisor && (
          <button
            type="button"
            onClick={() => setRole("supervisor")}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo px-4 py-2 text-sm font-bold text-white active:scale-95"
          >
            Switch to supervisor role
          </button>
        )}
      </header>

      {!isSupervisor && (
        <p className="flex items-center gap-2 rounded-xl bg-indigo/10 p-3 text-sm text-indigo">
          <Info size={16} /> You are in <b>operator</b> role. Contact reveal requires supervisor
          role — switch above to unmask PII.
        </p>
      )}

      {loadErr && (
        <p className="flex items-center gap-2 rounded-xl bg-saffron/10 p-3 text-sm text-saffron-dark">
          <AlertTriangle size={16} /> Could not reach the registry (backend at 127.0.0.1:8000).
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* left: case picker */}
        <aside className="space-y-3">
          <CaseFilters value={filter} onChange={setFilter} />
          {cases == null ? (
            <p className="flex items-center gap-2 p-4 text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </p>
          ) : (
            <CaseList cases={cases} selectedId={selected?.case_id} onSelect={pick} filter={filter} />
          )}
        </aside>

        {/* right: workspace */}
        <section className="space-y-5">
          {!selected && (
            <div className="grid place-items-center rounded-3xl border-2 border-dashed border-border bg-card p-12 text-center text-muted">
              <ShieldCheck size={32} className="mb-2 text-indigo/50" />
              Select a case to review.
            </div>
          )}

          {selected && (
            <>
              {/* case header + reveal contact */}
              <div className="space-y-4 rounded-3xl border-2 border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-2xl text-white ${
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
                      <span>{selected.gender} · {selected.age_band}</span>
                      {selected.last_seen_location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={13} /> {selected.last_seen_location}
                        </span>
                      )}
                      <span className="font-mono text-xs">{selected.case_id}</span>
                    </p>
                  </div>
                </div>

                {isSupervisor ? (
                  <RevealContact caseId={selected.case_id} masked={selected.mobile} />
                ) : (
                  <p className="rounded-2xl border-2 border-border bg-background p-4 text-sm text-muted">
                    Contact: <span className="font-mono">{selected.mobile ?? "—"}</span> (masked —
                    supervisor role required to reveal).
                  </p>
                )}
              </div>

              {confirmed && (
                <div className="flex items-center gap-2 rounded-2xl border-2 border-teal/40 bg-teal/5 p-4 text-teal">
                  <CheckCircle2 size={20} />
                  <span className="font-semibold">
                    Match confirmed with{" "}
                    <span className="font-mono">{confirmed.matchedId}</span>.
                    {confirmed.queued && " (queued — will sync when online)"}
                  </span>
                </div>
              )}

              {/* candidate matches with confirm */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
                  Candidate matches
                </h3>
                {matching && (
                  <p className="flex items-center gap-2 text-muted">
                    <Loader2 size={18} className="animate-spin" /> Finding matches…
                  </p>
                )}
                {!matching && matches && matches.length === 0 && (
                  <p className="rounded-2xl border border-border bg-card p-5 text-muted">
                    No candidates returned.
                  </p>
                )}
                {matches?.map((c, i) => (
                  <MatchCard
                    key={c.case_id}
                    candidate={c}
                    query={selected}
                    language={language}
                    rank={i + 1}
                    defaultOpen={i === 0}
                    onConfirm={isSupervisor ? onConfirm : undefined}
                    confirming={confirmingId === c.case_id}
                    confirmLabel="Confirm this match"
                  />
                ))}
              </div>

              {/* duplicate review + audit */}
              <div className="rounded-3xl border-2 border-border bg-card p-5">
                <DuplicateReview caseDoc={selected} language={language} />
              </div>
              <div className="rounded-3xl border-2 border-border bg-card p-5">
                <AuditTrail caseId={selected.case_id} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
