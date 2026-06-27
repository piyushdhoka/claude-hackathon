"use client";
// Search & Match Review. Browse open cases, pick one, and see ranked cross-center
// MatchCandidates with the per-feature CONTRIBUTIONS breakdown, the candidate's
// visual_description and the Claude rationale (via MatchCard). For a missing case
// we search the FOUND registry; for a found case we search MISSING.
import { useCallback, useEffect, useState } from "react";
import { Loader2, ArrowRight, MapPin, User, Sparkles, AlertTriangle } from "lucide-react";
import { useApp } from "@/store/app";
import type { Case, MatchCandidate } from "@/lib/types";
import { loadCases, runMatch as runMatchData } from "@/lib/data";
import { CaseFilters, CaseList } from "@/components/review/CaseList";
import { MatchCard } from "@/components/review/MatchCard";

export default function ReviewPage() {
  const { role, language, online } = useApp();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [offlineData, setOfflineData] = useState(false);
  const [filter, setFilter] = useState({ case_type: "", q: "" });

  const [selected, setSelected] = useState<Case | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null);
  const [matching, setMatching] = useState(false);

  // load the registry — offline-aware (mirror + match-lite when the network dies)
  useEffect(() => {
    let cancelled = false;
    loadCases({ limit: 1000 }, role, online)
      .then(({ cases: cs, source }) => {
        if (cancelled) return;
        setCases(cs);
        setOfflineData(source === "mirror");
        setLoadErr(source === "mirror" && cs.length === 0);
      })
      .catch(() => {
        if (!cancelled) {
          setCases([]);
          setLoadErr(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [role, online]);

  const runMatch = useCallback(
    async (c: Case) => {
      setSelected(c);
      setMatches(null);
      setMatching(true);
      // missing case -> search found registry, and vice-versa
      const target = c.case_type === "missing" ? "found" : "missing";
      try {
        const { matches: res } = await runMatchData(c, target, online, 5);
        setMatches(res);
      } catch {
        setMatches([]);
      } finally {
        setMatching(false);
      }
    },
    [online]
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Search &amp; Match</h1>
        <p className="text-muted">
          Pick a case to see ranked candidates from every center, with the reasons behind each score.
        </p>
      </header>

      {offlineData && !loadErr && (
        <p className="flex items-center gap-2 rounded-xl bg-indigo/10 p-3 text-sm text-indigo">
          <AlertTriangle size={16} /> Offline — searching the locally cached registry with the
          on-device matcher. Results sync when the network returns.
        </p>
      )}

      {loadErr && (
        <p className="flex items-center gap-2 rounded-xl bg-saffron/10 p-3 text-sm text-saffron-dark">
          <AlertTriangle size={16} /> No cached cases yet. Connect once (backend at 127.0.0.1:8000)
          to warm the offline copy.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* left: case picker */}
        <aside className="space-y-3">
          <CaseFilters value={filter} onChange={setFilter} />
          {cases == null ? (
            <p className="flex items-center gap-2 p-4 text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading cases…
            </p>
          ) : (
            <CaseList
              cases={cases}
              selectedId={selected?.case_id}
              onSelect={runMatch}
              filter={filter}
            />
          )}
        </aside>

        {/* right: selected case + matches */}
        <section className="space-y-4">
          {!selected && (
            <div className="grid place-items-center rounded-3xl border-2 border-dashed border-border bg-card p-12 text-center text-muted">
              <Sparkles size={32} className="mb-2 text-saffron/60" />
              Select a case on the left to find its matches.
            </div>
          )}

          {selected && (
            <>
              <div className="rounded-3xl border-2 border-border bg-card p-5">
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
                      <span className="text-sm font-medium text-muted">
                        ({selected.case_type})
                      </span>
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
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-saffron/10 px-3 py-1 text-xs font-bold text-saffron-dark">
                    searching {selected.case_type === "missing" ? "found" : "missing"}
                    <ArrowRight size={13} />
                  </span>
                </div>
                {selected.description && (
                  <p className="mt-3 text-sm leading-relaxed text-foreground/80">
                    {selected.description}
                  </p>
                )}
                {selected.visual_description && (
                  <p className="mt-2 rounded-xl bg-indigo/5 p-3 text-sm leading-relaxed">
                    <span className="font-semibold text-indigo">Photo: </span>
                    {selected.visual_description}
                  </p>
                )}
              </div>

              {matching && (
                <p className="flex items-center gap-2 p-4 text-muted">
                  <Loader2 size={18} className="animate-spin" /> Finding matches…
                </p>
              )}

              {!matching && matches && matches.length === 0 && (
                <p className="rounded-2xl border border-border bg-card p-6 text-muted">
                  No candidates returned. The match engine may be offline or there are no comparable
                  cases yet.
                </p>
              )}

              <div className="space-y-3">
                {matches?.map((c, i) => (
                  <MatchCard
                    key={c.case_id}
                    candidate={c}
                    query={selected}
                    language={language}
                    rank={i + 1}
                    defaultOpen={i === 0}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
