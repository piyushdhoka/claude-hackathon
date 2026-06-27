// Thin API client for the Setu backend. All network calls go through here so the
// offline layer can wrap/intercept them in one place.
import type {
  Case,
  ClaimVerdict,
  CorridorResult,
  HandoffResult,
  MatchCandidate,
  NotifyResult,
  SetuEvent,
  TriageItem,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Role = "operator" | "supervisor";

async function req<T>(
  path: string,
  opts: RequestInit & { role?: Role } = {}
): Promise<T> {
  const { role, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { "X-Role": role } : {}),
      ...(headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => req<{ status: string; claude_key_present: boolean }>("/health"),

  // --- registry / sync ---
  postEvents: (events: SetuEvent[]) =>
    req<{ received: number; applied: number }>("/registry/events", {
      method: "POST",
      body: JSON.stringify(events),
    }),
  listCases: (params: { case_type?: string; status?: string; limit?: number } = {}, role?: Role) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null) as [string, string][]
    ).toString();
    return req<Case[]>(`/registry/cases${q ? `?${q}` : ""}`, { role });
  },
  getCase: (id: string, role?: Role) => req<Case>(`/registry/cases/${id}`, { role }),
  getAudit: (id: string) => req<unknown[]>(`/registry/cases/${id}/audit`),

  // --- match ---
  match: (query: Partial<Case>, case_type = "missing", top_k = 5) =>
    req<MatchCandidate[]>(`/match?case_type=${case_type}&top_k=${top_k}`, {
      method: "POST",
      body: JSON.stringify(query),
    }),
  dedupe: (query: Partial<Case>) =>
    req<MatchCandidate[]>(`/match/dedupe`, {
      method: "POST",
      body: JSON.stringify(query),
    }),

  // --- enrichment (Claude; degrades gracefully) ---
  enrichAttributes: (payload: Record<string, unknown>) =>
    req<{ enriched: boolean; attributes: Record<string, unknown> }>("/enrich/attributes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  explainMatch: (payload: Record<string, unknown>) =>
    req<{ rationale: string | null }>("/enrich/explain", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  translate: (strings: Record<string, string>, language: string) =>
    req<{ translated: boolean; strings: Record<string, string> }>("/enrich/translate", {
      method: "POST",
      body: JSON.stringify({ strings, language }),
    }),
  // Claude-vision analysis of a captured photo -> localized visual description + attributes
  analyzeVision: (payload: {
    image_b64: string;
    media_type?: string;
    language?: string;
    gender?: string;
    age_band?: string;
  }) =>
    req<{
      analyzed: boolean;
      visual_description: string | null;
      attributes: Record<string, unknown>;
      contradicts_structured?: boolean;
    }>("/enrich/vision", { method: "POST", body: JSON.stringify(payload) }),
  // Claude-vision photo comparison for two candidates (assistive, human-in-the-loop).
  comparePhotos: (payload: {
    image_a_b64: string;
    image_b_b64: string;
    language?: string;
  }) =>
    req<{
      compared: boolean;
      verdict: string | null; // likely_same | likely_different | uncertain
      confidence: number | null;
      reasoning: string | null;
    }>("/enrich/compare", { method: "POST", body: JSON.stringify(payload) }),

  // --- geo ---
  hotspots: () => req<unknown[]>("/geo/hotspots"),
  kiosks: () => req<unknown[]>("/geo/kiosks"),

  // --- F3 triage: vulnerability-ranked open cases + reunion ETA ---
  triageQueue: (params: { sla_hours?: number; limit?: number } = {}, role?: Role) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    ).toString();
    return req<TriageItem[]>(`/triage/queue${q ? `?${q}` : ""}`, { role });
  },

  // --- F2 CCTV search corridor ---
  corridor: (location: string, radius_m = 1500, top_k = 15) =>
    req<CorridorResult>(
      `/geo/corridor?location=${encodeURIComponent(location)}&radius_m=${radius_m}&top_k=${top_k}`
    ),

  // --- F5 reunion handoff routing ---
  handoff: (location: string, k = 3) =>
    req<HandoffResult>(`/geo/handoff?location=${encodeURIComponent(location)}&k=${k}`),

  // --- F4 family self-search (describe lost person -> ranked found candidates) ---
  searchFamily: (payload: Record<string, unknown>, top_k = 8) =>
    req<MatchCandidate[]>(`/search/family?top_k=${top_k}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // --- F1 SMS/IVR notify-on-match ---
  notifyMatch: (payload: { case_id: string; center: string; code: string }) =>
    req<NotifyResult>("/notify/match", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // --- F6 claim-fraud guard ---
  assessClaim: (payload: {
    case_id: string;
    claim: Record<string, unknown>;
    history?: unknown[];
  }) =>
    req<ClaimVerdict>("/claim/assess", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
