"use client";
// Search & Match Review. Browse open cases, pick one, and see ranked cross-center
// MatchCandidates with the per-feature CONTRIBUTIONS breakdown, the candidate's
// visual_description and the Claude rationale (via MatchCard). For a missing case
// we search the FOUND registry; for a found case we search MISSING.
//
// OFFLINE-AWARE: data flows through lib/data (loadCases / runMatch) with the
// `online` flag from useApp — server engine when online, on-device match-lite over
// the Dexie mirror when offline. The picker uses a mobile-first master/detail
// pattern: on phones, choosing a case slides to the results; on desktop it splits.
import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  MapPin,
  User,
  Sparkles,
  AlertTriangle,
  CloudOff,
  SlidersHorizontal,
} from "lucide-react";
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
  const [matchSource, setMatchSource] = useState<"live" | "mirror" | null>(null);

  // load the registry — offline-aware (mirror + match-lite when the network dies)
  useEffect(() => {
    let cancelled = false;
    setCases(null);
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
      setMatchSource(null);
      // missing case -> search found registry, and vice-versa
      const target = c.case_type === "missing" ? "found" : "missing";
      try {
        const { matches: res, source } = await runMatchData(c, target, online, 5);
        setMatches(res);
        setMatchSource(source);
      } catch {
        setMatches([]);
      } finally {
        setMatching(false);
      }
    },
    [online]
  );

  const targetPool = selected
    ? selected.case_type === "missing"
      ? "found"
      : "missing"
    : null;

  return (
    <div className="space-y-5">
      {/* header */}
      <header className="animate-rise">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Search &amp; Match
          </h1>
          <span className="river-rule hidden flex-1 sm:block" />
        </div>
        <p className="mt-1 text-sm text-muted sm:text-base">
          Pick a case to see ranked candidates from <b>every center</b>, with the reasons
          behind each score.
        </p>
      </header>

      {/* offline / empty banners */}
      {offlineData && !loadErr && (
        <p className="flex items-center gap-2 rounded-xl bg-indigo/10 p-3 text-sm font-medium text-indigo">
          <CloudOff size={16} className="shrink-0" /> Offline — searching the cached registry
          with the on-device matcher. Results sync when the network returns.
        </p>
      )}
      {loadErr && (
        <p className="flex items-center gap-2 rounded-xl bg-saffron/12 p-3 text-sm font-medium text-saffron-dark">
          <AlertTriangle size={16} className="shrink-0" /> No cached cases yet. Connect once
          (backend at 127.0.0.1:8000) to warm the offline copy.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        {/* ── left: case picker (collapses on mobile once selected) ──────── */}
        <aside className={selected ? "hidden lg:block" : "block"}>
          <div className="space-y-3 lg:sticky lg:top-20">
            <CaseFilters value={filter} onChange={setFilter} />
            {cases == null ? (
              <CaseListSkeleton />
            ) : (
              <CaseList
                cases={cases}
                selectedId={selected?.case_id}
                onSelect={runMatch}
                filter={filter}
              />
            )}
          </div>
        </aside>

        {/* ── right: selected case + matches ─────────────────────────────── */}
        <section className="space-y-4">
          {!selected && (
            <div className="grid place-items-center rounded-3xl border-2 border-dashed border-border bg-surface p-10 text-center text-muted sm:p-12">
              <Sparkles size={32} className="mb-2 text-saffron/60" />
              <span className="max-w-xs">
                Select a case to find its matches across all centers.
              </span>
            </div>
          )}

          {selected && (
            <>
              {/* mobile: back to list */}
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

              {/* selected case header */}
              <div className="rounded-3xl border-2 border-border bg-surface p-5 shadow-sm animate-rise">
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white ${
                      selected.case_type === "found" ? "bg-teal" : "bg-rose"
                    }`}
                  >
                    <User size={22} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-xl font-bold">
                      {selected.name || "Unnamed person"}{" "}
                      <span className="text-sm font-medium text-muted">
                        ({selected.case_type})
                      </span>
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
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-surface-2/70 px-3 py-2 text-sm font-semibold">
                  <span className="text-muted">Searching</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      selected.reporting_center ? "bg-saffron/15 text-saffron-dark" : ""
                    }`}
                  >
                    {selected.reporting_center ?? "this center"}
                  </span>
                  <ArrowRight size={14} className="text-muted" />
                  <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-xs font-bold text-indigo">
                    all centers · {targetPool} registry
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

              {matchSource === "mirror" && !matching && (
                <p className="flex items-center gap-2 rounded-xl bg-indigo/10 p-3 text-xs font-medium text-indigo">
                  <CloudOff size={14} /> Ranked on-device against the cached registry mirror.
                </p>
              )}

              {matching && (
                <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-muted">
                  <Loader2 size={18} className="animate-spin" /> Finding matches across centers…
                </div>
              )}

              {!matching && matches && matches.length === 0 && (
                <p className="rounded-2xl border border-border bg-surface p-6 text-muted">
                  No candidates returned. The match engine may be offline or there are no
                  comparable cases yet.
                </p>
              )}

              <div className="space-y-3">
                {matches?.map((c, i) => (
                  <MatchCard
                    key={c.case_id}
                    candidate={c}
                    query={selected}
                    queryCenter={selected.reporting_center}
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

function CaseListSkeleton() {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 px-1 pb-1 text-sm text-muted">
        <SlidersHorizontal size={14} /> Loading cases…
      </p>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
          <div className="skeleton h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-2/3 rounded" />
            <div className="skeleton h-2.5 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
