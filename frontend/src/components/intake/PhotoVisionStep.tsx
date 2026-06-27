"use client";
// REQUIRED FEATURE — photo capture + Claude vision.
// 1. Capture a photo via the device camera (getUserMedia) OR upload a file.
// 2. Preview it.
// 3. Call api.analyzeVision({ image_b64, media_type, language, gender, age_band }).
// 4. Display the returned visual_description (in the pilgrim's language) + the
//    detected visual attributes as editable chips. The operator confirms/edits;
//    confirmed attributes are merged into the case via onResult.
//
// Degrades gracefully: no camera -> upload only; backend down -> the photo is
// still kept and the operator can proceed without a description.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  RefreshCw,
  Loader2,
  Sparkles,
  X,
  Volume2,
  Check,
} from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { useSpeech } from "@/components/common/useSpeech";

export interface VisionResult {
  image_b64: string | null; // data url
  visual_description: string | null;
  attributes: Record<string, unknown>;
}

// Attribute keys we surface as chips (subset of Attributes visual fields).
const SCALAR_KEYS = ["build", "hair", "complexion", "headwear", "footwear"] as const;

function dataUrlToB64(dataUrl: string): { b64: string; mediaType: string } {
  const [head, body] = dataUrl.split(",");
  const m = /data:(.*?);base64/.exec(head);
  return { b64: body ?? "", mediaType: m?.[1] ?? "image/jpeg" };
}

export function PhotoVisionStep({
  language,
  gender,
  ageBand,
  value,
  onChange,
}: {
  language: string;
  gender?: string;
  ageBand?: string;
  value: VisionResult | null;
  onChange: (r: VisionResult | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<"choose" | "camera" | "preview">(
    value?.image_b64 ? "preview" : "choose"
  );
  const [camError, setCamError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(!!value?.visual_description);
  const [desc, setDesc] = useState<string | null>(value?.visual_description ?? null);
  // editable attribute state
  const [attrs, setAttrs] = useState<Record<string, unknown>>(value?.attributes ?? {});

  const { supported: ttsOk, speak, speaking } = useSpeech(language);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setCamError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCamError("Camera not available on this device — please upload a photo.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode("camera");
      // attach after render
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCamError("Could not open the camera — please upload a photo instead.");
    }
  }, []);

  const adoptImage = useCallback(
    (dataUrl: string) => {
      setDesc(null);
      setAnalyzed(false);
      setAttrs({});
      onChange({ image_b64: dataUrl, visual_description: null, attributes: {} });
      setMode("preview");
    },
    [onChange]
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stopCamera();
    adoptImage(dataUrl);
  }, [adoptImage, stopCamera]);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => adoptImage(String(reader.result));
      reader.readAsDataURL(file);
    },
    [adoptImage]
  );

  const retake = useCallback(() => {
    onChange(null);
    setDesc(null);
    setAttrs({});
    setAnalyzed(false);
    setMode("choose");
  }, [onChange]);

  const analyze = useCallback(async () => {
    if (!value?.image_b64) return;
    setAnalyzing(true);
    const { b64, mediaType } = dataUrlToB64(value.image_b64);
    try {
      const res = await api.analyzeVision({
        image_b64: b64,
        media_type: mediaType,
        language,
        gender,
        age_band: ageBand,
      });
      const newAttrs = (res?.attributes as Record<string, unknown>) ?? {};
      setDesc(res?.visual_description ?? null);
      setAttrs(newAttrs);
      setAnalyzed(true);
      onChange({
        image_b64: value.image_b64,
        visual_description: res?.visual_description ?? null,
        attributes: newAttrs,
      });
    } catch {
      // Backend down / vision disabled — keep the photo, allow manual proceed.
      setAnalyzed(true);
      setDesc(null);
    } finally {
      setAnalyzing(false);
    }
  }, [value?.image_b64, language, gender, ageBand, onChange]);

  // keep parent in sync when operator edits attributes/description
  const pushEdit = useCallback(
    (nextAttrs: Record<string, unknown>, nextDesc: string | null) => {
      if (!value?.image_b64) return;
      onChange({ image_b64: value.image_b64, visual_description: nextDesc, attributes: nextAttrs });
    },
    [onChange, value?.image_b64]
  );

  const clearAttr = (key: string) => {
    const next = { ...attrs };
    delete next[key];
    setAttrs(next);
    pushEdit(next, desc);
  };

  const accessories = Array.isArray(attrs.accessories) ? (attrs.accessories as string[]) : [];

  const removeAccessory = (item: string) => {
    const next = { ...attrs, accessories: accessories.filter((a) => a !== item) };
    setAttrs(next);
    pushEdit(next, desc);
  };

  return (
    <div className="space-y-4">
      {/* ---- choose source ---- */}
      {mode === "choose" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={startCamera}
            className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-border bg-card p-8 text-center font-bold shadow-sm transition hover:border-saffron/50 active:scale-[0.98]"
          >
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-saffron/10 text-saffron">
              <Camera size={32} />
            </span>
            Take a photo
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-border bg-card p-8 text-center font-bold shadow-sm transition hover:border-saffron/50 active:scale-[0.98]"
          >
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-indigo/10 text-indigo">
              <Upload size={32} />
            </span>
            Upload a photo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFile}
          />
        </div>
      )}

      {camError && (
        <p className="rounded-xl bg-rose/10 p-3 text-sm font-medium text-rose">{camError}</p>
      )}

      {/* ---- live camera ---- */}
      {mode === "camera" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-3xl border-2 border-border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setMode("choose");
              }}
              className="rounded-full border border-border px-5 py-3 font-semibold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={capture}
              className="inline-flex items-center gap-2 rounded-full bg-saffron px-7 py-3 text-lg font-bold text-white shadow active:scale-95"
            >
              <Camera size={20} /> Capture
            </button>
          </div>
        </div>
      )}

      {/* ---- preview + analysis ---- */}
      {mode === "preview" && value?.image_b64 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative shrink-0 overflow-hidden rounded-3xl border-2 border-border sm:w-56">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.image_b64} alt="Captured" className="aspect-[3/4] w-full object-cover" />
              <button
                type="button"
                onClick={retake}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur"
              >
                <RefreshCw size={13} /> Retake
              </button>
            </div>

            <div className="flex-1 space-y-3">
              {!analyzed && (
                <button
                  type="button"
                  onClick={analyze}
                  disabled={analyzing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo px-5 py-4 text-lg font-bold text-white shadow transition active:scale-[0.98] disabled:opacity-60"
                >
                  {analyzing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" /> Analysing photo…
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} /> Analyse with Claude
                    </>
                  )}
                </button>
              )}

              {analyzed && desc && (
                <div className="rounded-2xl border border-indigo/20 bg-indigo/5 p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-indigo">
                      What Claude sees
                    </span>
                    {ttsOk && (
                      <button
                        type="button"
                        onClick={() => speak(desc)}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo/10 px-2.5 py-1 text-xs font-bold text-indigo"
                      >
                        <Volume2 size={13} className={speaking ? "animate-pulse" : ""} /> Read
                      </button>
                    )}
                  </div>
                  <p className="text-base leading-relaxed">{desc}</p>
                </div>
              )}

              {analyzed && !desc && (
                <p className="rounded-2xl bg-background p-4 text-sm text-muted">
                  Photo saved. Vision description is unavailable right now (offline or disabled) —
                  you can still continue; the photo is attached to the case.
                </p>
              )}
            </div>
          </div>

          {/* detected attribute chips (editable) */}
          {analyzed && (Object.keys(attrs).length > 0) && (
            <div className="rounded-2xl border border-border bg-background/50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                Detected details — tap × to remove anything wrong
              </p>
              <div className="flex flex-wrap gap-2">
                {SCALAR_KEYS.map((k) =>
                  attrs[k] ? (
                    <AttrChip key={k} label={`${k}: ${String(attrs[k])}`} onRemove={() => clearAttr(k)} />
                  ) : null
                )}
                {accessories.map((a) => (
                  <AttrChip key={a} label={a} onRemove={() => removeAccessory(a)} />
                ))}
                {typeof attrs.visual_quality === "string" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-medium text-muted ring-1 ring-border">
                    quality: {String(attrs.visual_quality)}
                  </span>
                )}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-teal">
                <Check size={13} /> These details will be merged into the case.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AttrChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full bg-indigo/10 px-3 py-1.5 text-sm font-semibold text-indigo"
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="grid h-5 w-5 place-items-center rounded-full bg-indigo/20 text-indigo hover:bg-indigo/30"
        aria-label={`Remove ${label}`}
      >
        <X size={12} strokeWidth={3} />
      </button>
    </span>
  );
}
