"use client";
// Optional voice note. Records a short clip via MediaRecorder and keeps it as a
// data URL on the case remarks-adjacent state (the operator can play it back).
// Entirely optional and degrades gracefully if MediaRecorder is unavailable.
import { useCallback, useRef, useState } from "react";
import { Mic, Square, Play, Trash2, Pause } from "lucide-react";

export interface VoiceNote {
  dataUrl: string;
  seconds: number;
}

export function VoiceNoteStep({
  value,
  onChange,
}: {
  value: VoiceNote | null;
  onChange: (v: VoiceNote | null) => void;
}) {
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== "undefined" &&
    "MediaRecorder" in window &&
    !!navigator.mediaDevices?.getUserMedia;

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        const reader = new FileReader();
        reader.onload = () => onChange({ dataUrl: String(reader.result), seconds });
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      startedAtRef.current = Date.now();
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone not available — this step is optional, you can skip it.");
    }
  }, [onChange]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing]);

  if (!supported) {
    return (
      <p className="rounded-2xl bg-background p-4 text-center text-muted">
        Voice recording is not available on this device. This step is optional — tap Next to
        continue.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-rose/10 p-3 text-sm text-rose">{error}</p>}

      {!value && (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={recording ? stop : start}
            className={`grid h-28 w-28 place-items-center rounded-full text-white shadow-lg transition active:scale-95 ${
              recording ? "animate-pulse bg-rose" : "bg-saffron"
            }`}
          >
            {recording ? <Square size={40} /> : <Mic size={44} />}
          </button>
          <span className="text-lg font-bold">
            {recording ? "Recording… tap to stop" : "Tap to record a short note (optional)"}
          </span>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-4 rounded-3xl border-2 border-border bg-card p-5">
          <button
            type="button"
            onClick={togglePlay}
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-indigo text-white shadow active:scale-95"
          >
            {playing ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <div className="flex-1">
            <p className="text-lg font-bold">Voice note saved</p>
            <p className="text-sm text-muted">about {value.seconds}s</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setPlaying(false);
            }}
            className="grid h-12 w-12 place-items-center rounded-full border border-border text-rose"
            aria-label="Delete voice note"
          >
            <Trash2 size={20} />
          </button>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={value.dataUrl} onEnded={() => setPlaying(false)} hidden />
        </div>
      )}
    </div>
  );
}
