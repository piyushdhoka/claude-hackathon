"use client";
// One ranked MatchCandidate, rendered for the operator. Shows score + confidence
// band, the candidate's key attributes, the per-feature CONTRIBUTIONS bar, the
// candidate's visual_description, and (lazily, on demand) the Claude rationale via
// api.explainMatch. Everything degrades gracefully when the backend is down.
import { useCallback, useState } from "react";
import { clsx } from "clsx";
import { Sparkles, MapPin, User, ChevronDown, ShieldCheck, Loader2 } from "lucide-react";
import type { Case, MatchCandidate } from "@/lib/types";
import { api } from "@/lib/api";
import { bandForScore } from "./confidence";
import { ContributionsBar } from "./ContributionsBar";

export function MatchCard({
  candidate,
  query,
  language,
  rank,
  onConfirm,
  confirmLabel = "Confirm match",
  confirming,
  defaultOpen = false,
}: {
  candidate: MatchCandidate;
  query?: Partial<Case>;
  language?: string;
  rank?: number;
  onConfirm?: (candidate: MatchCandidate) => void;
  confirmLabel?: string;
  confirming?: boolean;
  defaultOpen?: boolean;
}) {
  const band = bandForScore(candidate.score);
  const c = candidate.case ?? {};
  const [open, setOpen] = useState(defaultOpen);
  const [rationale, setRationale] = useState<string | null>(candidate.rationale ?? null);
  const [explainState, setExplainState] = useState<"idle" | "loading" | "done" | "error">(
    candidate.rationale ? "done" : "idle"
  );

  const explain = useCallback(async () => {
    if (explainState === "loading" || explainState === "done") return;
    setExplainState("loading");
    try {
      const res = await api.explainMatch({
        query: query ?? {},
        candidate: c,
        contributions: candidate.contributions,
        score: candidate.score,
        language: language ?? "en",
      });
      setRationale(res?.rationale ?? null);
      setExplainState("done");
    } catch {
      setExplainState("error");
    }
  }, [explainState, query, c, candidate.contributions, candidate.score, language]);

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-3xl border-2 bg-card shadow-sm transition",
        band.level === "high" ? "border-teal/40" : "border-border"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-4 p-4 sm:p-5">
        {/* Score dial */}
        <div className="relative grid h-16 w-16 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={band.hex}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(candidate.score / 100) * 97.4} 97.4`}
            />
          </svg>
          <span className="absolute text-lg font-extrabold" style={{ color: band.hex }}>
            {Math.round(candidate.score)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {rank != null && (
              <span className="rounded-md bg-background px-1.5 py-0.5 font-mono text-xs font-bold text-muted">
                #{rank}
              </span>
            )}
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
                band.pill
              )}
            >
              <span className={clsx("h-2 w-2 rounded-full", band.dot)} />
              {band.label}
            </span>
          </div>
          <h3 className="mt-1 truncate text-lg font-bold">
            {c.name || <span className="text-muted">Unnamed person</span>}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <User size={13} /> {c.gender || "?"} · {c.age_band || "?"}
            </span>
            {c.last_seen_location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} /> {c.last_seen_location}
              </span>
            )}
            {c.reporting_center && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck size={13} /> {c.reporting_center}
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-muted transition hover:bg-background"
          title={open ? "Hide why" : "Show why"}
        >
          <ChevronDown size={20} className={clsx("transition", open && "rotate-180")} />
        </button>
      </div>

      {/* Expandable "why" */}
      {open && (
        <div className="space-y-4 border-t border-border bg-background/40 p-4 sm:p-5">
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              Why this score
            </h4>
            <ContributionsBar contributions={candidate.contributions} />
          </div>

          {c.visual_description && (
            <div>
              <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">
                Photo description (from vision)
              </h4>
              <p className="rounded-xl bg-indigo/5 p-3 text-sm leading-relaxed text-foreground/90">
                {c.visual_description}
              </p>
            </div>
          )}

          {/* Claude rationale */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
                Claude&apos;s reasoning
              </h4>
              {explainState === "idle" && (
                <button
                  type="button"
                  onClick={explain}
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo/10 px-3 py-1 text-xs font-bold text-indigo transition hover:bg-indigo/20"
                >
                  <Sparkles size={13} /> Explain
                </button>
              )}
            </div>
            {explainState === "loading" && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 size={14} className="animate-spin" /> Asking Claude…
              </p>
            )}
            {explainState === "done" && rationale && (
              <p className="rounded-xl border border-indigo/15 bg-indigo/5 p-3 text-sm leading-relaxed">
                {rationale}
              </p>
            )}
            {explainState === "done" && !rationale && (
              <p className="text-sm text-muted">
                No rationale available (Claude offline) — rely on the breakdown above.
              </p>
            )}
            {explainState === "error" && (
              <p className="text-sm text-muted">
                Could not reach Claude. The score breakdown above still applies.
              </p>
            )}
          </div>

          {onConfirm && (
            <button
              type="button"
              onClick={() => onConfirm(candidate)}
              disabled={confirming}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal px-5 py-3 text-base font-bold text-white shadow transition active:scale-[0.98] disabled:opacity-60 sm:w-auto"
            >
              {confirming ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
              {confirmLabel}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
