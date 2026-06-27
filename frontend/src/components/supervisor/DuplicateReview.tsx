"use client";
// Duplicate review — same engine, missing↔missing job (api.dedupe). Surfaces the
// ~8% cross-center duplicate reports so a supervisor can collapse them. Reuses the
// MatchCard so the contributions/rationale UI is identical to reunion matching.
import { useState } from "react";
import { Copy, Loader2, ScanSearch } from "lucide-react";
import { api } from "@/lib/api";
import type { Case, MatchCandidate } from "@/lib/types";
import { MatchCard } from "@/components/review/MatchCard";

export function DuplicateReview({ caseDoc, language }: { caseDoc: Case; language: string }) {
  const [dupes, setDupes] = useState<MatchCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    setRan(true);
    try {
      const res = await api.dedupe(caseDoc);
      // exclude self if the engine returns it
      setDupes(res.filter((d) => d.case_id !== caseDoc.case_id));
    } catch {
      setDupes([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
          <Copy size={16} /> Duplicate review
        </h3>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full bg-indigo/10 px-3 py-1.5 text-xs font-bold text-indigo transition hover:bg-indigo/20 disabled:opacity-60"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
          Check for duplicates
        </button>
      </div>

      {!ran && (
        <p className="text-sm text-muted">
          Find other reports across centers that may be the same person.
        </p>
      )}
      {ran && !loading && dupes && dupes.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted">
          No likely duplicates found.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {dupes?.map((d, i) => (
          <MatchCard key={d.case_id} candidate={d} query={caseDoc} language={language} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}
