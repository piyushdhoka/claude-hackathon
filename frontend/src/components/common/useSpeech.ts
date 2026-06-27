"use client";
// Web Speech API (SpeechSynthesis) wrapper for the spoken read-back. Degrades
// gracefully: if there is no voice for the language (or no API at all), `supported`
// is false and `voiceForLang` is null — callers should then show text + a note.
import { useCallback, useEffect, useState } from "react";

// Map our vocab language codes to BCP-47 tags the browser knows about.
const BCP47: Record<string, string> = {
  hi: "hi-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  gu: "gu-IN",
  mai: "hi-IN", // Maithili — fall back to Hindi voice
  bho: "hi-IN", // Bhojpuri — fall back to Hindi voice
  awa: "hi-IN", // Awadhi — fall back to Hindi voice
  en: "en-IN",
};

export function useSpeech(language: string) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  const tag = BCP47[language] ?? "en-IN";
  const voiceForLang =
    voices.find((v) => v.lang === tag) ??
    voices.find((v) => v.lang.startsWith(tag.split("-")[0])) ??
    null;

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = tag;
        if (voiceForLang) u.voice = voiceForLang;
        u.rate = 0.92; // slightly slower for elderly listeners
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(u);
      } catch {
        setSpeaking(false);
      }
    },
    [supported, tag, voiceForLang]
  );

  const stop = useCallback(() => {
    if (!supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setSpeaking(false);
  }, [supported]);

  return { supported, voiceForLang, speaking, speak, stop };
}
