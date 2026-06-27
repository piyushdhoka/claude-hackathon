"use client";
// PHOTO COMPARE — an assistive, human-in-the-loop "same person?" second opinion.
//
// When a supervisor has two photos of a potential match (e.g. the photo on file
// and a fresh photo of the person physically present), they can attach both and
// ask Claude vision (api.comparePhotos) for a verdict + confidence + reasoning.
// This NEVER auto-confirms — it is advisory only; the supervisor still decides.
// Degrades gracefully: backend down / vision disabled -> a clear "unavailable"
// note, and the photos stay attached.
import { useCallback, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  ImageUp,
  Loader2,
  ScanFace,
  X,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";

interface Verdict {
  verdict: string | null; // likely_same | likely_different | uncertain
  confidence: number | null;
  reasoning: string | null;
}

function dataUrlToB64(dataUrl: string): string {
  const body = dataUrl.split(",")[1];
  return body ?? "";
}

function PhotoSlot({
  label,
  value,
  onPick,
  onClear,
}: {
  label: string;
  value: string | null;
  onPick: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => onPick(String(reader.result));
      reader.readAsDataURL(file);
    },
    [onPick]
  );

  return (
    <div className="flex-1">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      {value ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="aspect-3/4 w-full object-cover" />
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
            aria-label={`Remove ${label}`}
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-3/4 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-2/50 text-muted transition hover:border-saffron/50 active:scale-[0.98]"
        >
          <ImageUp size={26} />
          <span className="text-sm font-semibold">Add photo</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}

const VERDICT_STYLE: Record<
  string,
  { label: string; tone: string; icon: typeof CheckCircle2 }
> = {
  likely_same: { label: "Likely the same person", tone: "bg-teal/10 text-teal border-teal/30", icon: CheckCircle2 },
  likely_different: { label: "Likely different people", tone: "bg-rose/10 text-rose border-rose/30", icon: X },
  uncertain: { label: "Uncertain — review manually", tone: "bg-saffron/12 text-saffron-dark border-saffron/30", icon: HelpCircle },
};

export function PhotoCompare({ language }: { language: string }) {
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canCompare = !!a && !!b && !loading;

  const compare = useCallback(async () => {
    if (!a || !b) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.comparePhotos({
        image_a_b64: dataUrlToB64(a),
        image_b_b64: dataUrlToB64(b),
        language,
      });
      if (!res?.compared) {
        setError("Photo comparison is unavailable right now (offline or vision disabled).");
      } else {
        setResult({
          verdict: res.verdict,
          confidence: res.confidence,
          reasoning: res.reasoning,
        });
      }
    } catch {
      setError("Could not reach the vision service. This tool is assistive — decide manually.");
    } finally {
      setLoading(false);
    }
  }, [a, b, language]);

  const style = result?.verdict ? VERDICT_STYLE[result.verdict] : null;
  const VerdictIcon = style?.icon ?? HelpCircle;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
          <ScanFace size={16} /> Photo compare
        </h3>
        <span className="rounded-full bg-indigo/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo">
          Assistive
        </span>
      </div>
      <p className="mb-3 text-sm text-muted">
        Attach two photos to get a Claude vision &ldquo;same person?&rdquo; second opinion. This is
        advisory only — you make the final call.
      </p>

      <div className="flex gap-3">
        <PhotoSlot label="Photo A" value={a} onPick={setA} onClear={() => { setA(null); setResult(null); }} />
        <PhotoSlot label="Photo B" value={b} onPick={setB} onClear={() => { setB(null); setResult(null); }} />
      </div>

      <button
        type="button"
        onClick={compare}
        disabled={!canCompare}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo px-5 py-3 text-base font-bold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <ScanFace size={18} />}
        {loading ? "Comparing…" : "Compare photos"}
      </button>

      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2/70 p-3 text-sm text-muted">
          <AlertTriangle size={15} className="shrink-0 text-saffron-dark" /> {error}
        </p>
      )}

      {result && style && (
        <div className={clsx("mt-3 rounded-2xl border-2 p-4 animate-pop", style.tone)}>
          <div className="flex items-center gap-2 font-bold">
            <VerdictIcon size={18} /> {style.label}
            {result.confidence != null && (
              <span className="ml-auto rounded-full bg-white/50 px-2 py-0.5 text-xs font-bold">
                {Math.round(result.confidence * 100)}% confidence
              </span>
            )}
          </div>
          {result.reasoning && (
            <p className="mt-2 text-sm leading-relaxed text-foreground/85">{result.reasoning}</p>
          )}
          <p className="mt-2 text-[11px] font-medium opacity-70">
            Advisory only — confirm the match with a human decision above.
          </p>
        </div>
      )}
    </div>
  );
}
