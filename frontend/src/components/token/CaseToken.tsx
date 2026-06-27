"use client";
//
// <CaseToken/> — a printable, scannable claim ticket shown right after intake.
//
// A phoneless family gets a slip with a QR they can carry; any volunteer at any
// center scans it to pull the case up instantly (the QR encodes a deep link to the
// case + the short id as fallback for manual entry). Works fully offline — the QR
// is rendered locally with qrcode.react, no network needed.
import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, MapPin } from "lucide-react";
import { clsx } from "clsx";

export interface CaseTokenProps {
  /** The case identifier, e.g. "KMP-2027-L001234". */
  caseId: string;
  /** The reporting center this case was registered at. */
  center: string;
  /** Optional pilgrim/case name to print under the id. */
  name?: string | null;
  /**
   * What the QR encodes. By default a relative deep link `/review?case=<id>`,
   * upgraded to an absolute URL at render time so a scan from any phone resolves.
   * Pass an explicit value to override (e.g. an https origin in production).
   */
  url?: string;
  /** QR module size in px. Default 168. */
  size?: number;
  /** Show the "Print slip" button (hidden in print output). Default true. */
  printable?: boolean;
  className?: string;
}

/** Build the absolute deep link that the QR encodes. */
function resolveUrl(caseId: string, url?: string): string {
  if (url) return url;
  const path = `/review?case=${encodeURIComponent(caseId)}`;
  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

export function CaseToken({
  caseId,
  center,
  name,
  url,
  size = 168,
  printable = true,
  className,
}: CaseTokenProps) {
  const value = useMemo(() => resolveUrl(caseId, url), [caseId, url]);

  return (
    <div
      className={clsx(
        "case-token relative mx-auto w-full max-w-xs rounded-2xl border border-border bg-card p-5 text-center shadow-sm",
        className
      )}
    >
      {/* Brand header */}
      <div className="mb-3 flex items-center justify-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-saffron text-sm font-bold text-white">
          से
        </span>
        <span className="text-sm font-bold tracking-tight">Setu Case Ticket</span>
      </div>

      {/* QR */}
      <div className="mx-auto inline-block rounded-xl bg-white p-3 ring-1 ring-border">
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          marginSize={0}
          aria-label={`QR code for case ${caseId}`}
        />
      </div>

      {/* Short id — big and scannable-by-eye for manual entry */}
      <div className="mt-3 select-all font-mono text-lg font-bold tracking-wide text-foreground">
        {caseId}
      </div>
      {name ? (
        <div className="mt-0.5 text-sm font-medium text-foreground">{name}</div>
      ) : null}

      <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted">
        <MapPin size={12} /> {center}
      </div>

      <p className="mt-3 text-[11px] leading-snug text-muted">
        Show or scan this at any Setu center to find this case. Keep it safe.
      </p>

      {printable ? (
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-background"
        >
          <Printer size={14} /> Print slip
        </button>
      ) : null}
    </div>
  );
}

export default CaseToken;
