"use client";
// Append-only audit trail for a case (api.getAudit). The event log IS the audit
// trail (see ARCHITECTURE.md), so this is the source-of-truth timeline.
import { useEffect, useState } from "react";
import { Loader2, History, Dot } from "lucide-react";
import { api } from "@/lib/api";

interface AuditEntry {
  type?: string;
  ts?: string;
  actor?: string;
  payload?: Record<string, unknown>;
  [k: string]: unknown;
}

export function AuditTrail({ caseId }: { caseId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(false);
    api
      .getAudit(caseId)
      .then((rows) => !cancelled && setEntries((rows as AuditEntry[]) ?? []))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <History size={16} className="text-muted" />
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Audit trail</h3>
      </div>

      {entries == null && !error && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      )}
      {error && <p className="text-sm text-muted">Audit unavailable (backend offline).</p>}
      {entries && entries.length === 0 && (
        <p className="text-sm text-muted">No events recorded yet.</p>
      )}

      {entries && entries.length > 0 && (
        <ol className="relative space-y-3 border-l-2 border-border pl-4">
          {entries.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[1.4rem] top-1 grid h-5 w-5 place-items-center rounded-full bg-saffron text-white">
                <Dot size={18} />
              </span>
              <div className="rounded-xl bg-surface p-3 ring-1 ring-border">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold text-saffron-dark">
                    {e.type ?? "event"}
                  </span>
                  <span className="text-xs text-muted">{e.ts ?? ""}</span>
                </div>
                {e.actor && <p className="text-xs text-muted">by {e.actor}</p>}
                {e.payload && Object.keys(e.payload).length > 0 && (
                  <pre className="mt-1 max-h-24 overflow-auto rounded bg-surface-2 p-2 text-[11px] leading-snug text-foreground/70">
                    {JSON.stringify(e.payload, null, 1)}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
