"use client";
// Explicit, logged-feeling PII reveal. The masked mobile shows by default; the
// supervisor must tap "Reveal contact", which re-fetches the case with the
// supervisor role so the backend unmasks the number. The action is deliberate
// (confirmation + a visible "revealed & logged" state) to reinforce accountability.
import { useState } from "react";
import { Eye, EyeOff, Phone, ShieldAlert, Loader2, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { Case } from "@/lib/types";

export function RevealContact({ caseId, masked }: { caseId: string; masked?: string | null }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doReveal = async () => {
    setLoading(true);
    setError(null);
    try {
      // Re-fetch as supervisor -> backend returns the unmasked mobile and logs it.
      const full = await api.getCase(caseId, "supervisor");
      setRevealed(full.mobile ?? "(no number on file)");
    } catch {
      setError("Could not reveal — backend unreachable.");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-rose/30 bg-rose/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-rose">
        <ShieldAlert size={16} />
        <span className="text-xs font-bold uppercase tracking-wide">Protected contact (PII)</span>
      </div>

      <div className="flex items-center gap-3">
        <Phone size={18} className="text-muted" />
        <span className="font-mono text-lg font-bold">
          {revealed ?? masked ?? "+91 ••••••••••"}
        </span>
        {revealed ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose/15 px-2.5 py-1 text-xs font-bold text-rose">
            <Eye size={12} /> Revealed &amp; logged
          </span>
        ) : (
          <Lock size={16} className="ml-auto text-muted" />
        )}
      </div>

      {error && <p className="mt-2 text-sm text-rose">{error}</p>}

      {!revealed && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-rose/40 bg-surface px-4 py-2 text-sm font-bold text-rose transition active:scale-95"
        >
          <Eye size={15} /> Reveal contact
        </button>
      )}

      {confirming && !revealed && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Reveal and log this access?</span>
          <button
            type="button"
            onClick={doReveal}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose px-4 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Yes, reveal
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-bold text-muted active:scale-95"
          >
            <EyeOff size={14} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}
