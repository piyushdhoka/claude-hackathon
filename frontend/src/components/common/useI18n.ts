"use client";
// Lightweight, optimistic localization. We render English immediately and, if the
// pilgrim's language is non-English and we're online, ask the backend (Claude) to
// translate a batch of strings; results are cached per-language in component state.
// Always degrades to English — the UI never blocks on the network.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Dict = Record<string, string>;
// Module-level cache so navigating between steps doesn't re-hit the network.
const cache = new Map<string, Dict>(); // key: `${lang}::${joinedKeys}`

export function useI18n(language: string, strings: Dict) {
  const [t, setT] = useState<Dict>(strings);
  // stable signature of the english keys+values so the effect only re-runs on change
  const sig = JSON.stringify(strings);
  const sigRef = useRef(sig);
  sigRef.current = sig;

  useEffect(() => {
    if (!language || language === "en") {
      setT(strings);
      return;
    }
    const cacheKey = `${language}::${sig}`;
    const hit = cache.get(cacheKey);
    if (hit) {
      setT(hit);
      return;
    }
    // optimistic: show English now
    setT(strings);
    let cancelled = false;
    api
      .translate(strings, language)
      .then((res) => {
        if (cancelled) return;
        const merged = { ...strings, ...(res?.strings || {}) };
        cache.set(cacheKey, merged);
        setT(merged);
      })
      .catch(() => {
        /* offline / 501 → keep English */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, sig]);

  // helper so callers can do tr("key") with English fallback
  const tr = useCallback((key: string) => t[key] ?? strings[key] ?? key, [t, strings]);
  return { t, tr };
}
