// match-lite — an offline JS matcher that mirrors shared/match_weights.json
// (via frontend/src/data/match_weights.json). It is the OFFLINE fallback for the
// backend match engine: when the network is down, Search & Match can still rank
// candidates from the local Dexie mirror so the console stays useful on snan days.
//
// It deliberately mirrors the engine's scoring contract:
//   blocking (cheap) -> weighted per-feature subscores -> available-case
//   normalization (absent features dropped from BOTH numerator and denominator)
//   -> hard rules (mobile-exact floor, gender/age-mismatch cap) -> 0..100 score
//   with per-feature `contributions`.
//
// It is intentionally lightweight (no phonetic/visual/face): those need the full
// engine. The online path (api.match/api.dedupe) is always preferred; this only
// kicks in offline. Online behaviour is unchanged.
import weightsJson from "@/data/match_weights.json";
import type { Case, CaseType, MatchCandidate } from "@/lib/types";

interface Weights {
  weights: Record<string, number>;
  sub_scores: {
    gender: { same: number; either_unknown: number; mismatch: number };
    age_band: { same: number; adjacent: number; else: number };
    geo: { decay_km: number };
    time: { decay_hours: number };
    state_district: { same_state: number; same_district: number };
  };
  hard_rules: {
    mobile_exact_floor: number;
    gender_age_mismatch_cap: number;
    gender_age_mismatch_bands_apart: number;
  };
  thresholds: { auto_flag: number; review_low: number };
  age_band_order: string[];
}

const W = weightsJson as unknown as Weights;

// --- small helpers ---------------------------------------------------------
function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

/** Normalised Levenshtein similarity in [0,1] (1 = identical). */
function nameSimilarity(a?: string | null, b?: string | null): number | null {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return null; // absent -> dropped from normalization
  if (x === y) return 1;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function haversineKm(
  lat1?: number | null,
  lng1?: number | null,
  lat2?: number | null,
  lng2?: number | null
): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function parseTs(ts?: string | null): number | null {
  if (!ts) return null;
  // dataset format "YYYY-MM-DD HH:MM"; make it ISO-ish for Date.
  const t = Date.parse(ts.replace(" ", "T"));
  return Number.isNaN(t) ? null : t;
}

function ageBandScore(a?: string | null, b?: string | null): number | null {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return null;
  const order = W.age_band_order.map((s) => s.toLowerCase());
  const ix = order.indexOf(x);
  const iy = order.indexOf(y);
  if (ix < 0 || iy < 0) return x === y ? W.sub_scores.age_band.same : null;
  const gap = Math.abs(ix - iy);
  if (gap === 0) return W.sub_scores.age_band.same;
  if (gap === 1) return W.sub_scores.age_band.adjacent;
  return W.sub_scores.age_band.else;
}

function bandsApart(a?: string | null, b?: string | null): number | null {
  const order = W.age_band_order.map((s) => s.toLowerCase());
  const ix = order.indexOf(norm(a));
  const iy = order.indexOf(norm(b));
  if (ix < 0 || iy < 0) return null;
  return Math.abs(ix - iy);
}

// --- per-feature subscores -------------------------------------------------
// Each returns a number in [0,1] or null (= feature absent -> dropped).
function subScores(q: Partial<Case>, c: Case): Record<string, number | null> {
  const ss = W.sub_scores;

  // gender
  let gender: number | null;
  const qg = norm(q.gender);
  const cg = norm(c.gender);
  if (!qg || !cg) gender = qg || cg ? ss.gender.either_unknown : null;
  else gender = qg === cg ? ss.gender.same : ss.gender.mismatch;

  // geo
  const km = haversineKm(q.lat, q.lng, c.lat, c.lng);
  const geo = km == null ? null : Math.exp(-km / ss.geo.decay_km);

  // time
  const tq = parseTs(q.reported_at);
  const tc = parseTs(c.reported_at);
  const time =
    tq == null || tc == null
      ? null
      : Math.exp(-Math.abs(tq - tc) / (ss.time.decay_hours * 3600_000));

  // language
  const ql = norm(q.language);
  const cl = norm(c.language);
  const language = !ql || !cl ? null : ql === cl ? 1 : 0;

  // state / district
  let sd: number | null = null;
  const qs = norm(q.state);
  const cs = norm(c.state);
  const qd = norm(q.district);
  const cd = norm(c.district);
  if (qs && cs && qd && cd && qs === cs && qd === cd) sd = 1;
  else if (qs && cs && qs === cs) sd = ss.state_district.same_state;
  else if (qs && cs) sd = 0;

  // description overlap (token Jaccard) — cheap proxy.
  const description = tokenOverlap(q.description, c.description);

  return {
    name_fuzzy: nameSimilarity(q.name, c.name),
    name_phonetic: null, // not implemented offline
    gender,
    age_band: ageBandScore(q.age_band, c.age_band),
    geo,
    time,
    language,
    state_district: sd,
    description,
  };
}

function tokenOverlap(a?: string | null, b?: string | null): number | null {
  const ax = norm(a);
  const bx = norm(b);
  if (!ax || !bx) return null;
  const A = new Set(ax.split(/\W+/).filter(Boolean));
  const B = new Set(bx.split(/\W+/).filter(Boolean));
  if (A.size === 0 || B.size === 0) return null;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

// --- public API ------------------------------------------------------------
export interface MatchLiteOptions {
  caseType?: CaseType; // which pool to search (default: opposite job handled by caller)
  topK?: number;
}

/**
 * Rank `candidates` against `query` with the offline scorer. Pure function —
 * pass it the local mirror (readMirroredCases) for an offline Search & Match.
 */
export function rankMatches(
  query: Partial<Case>,
  candidates: Case[],
  opts: MatchLiteOptions = {}
): MatchCandidate[] {
  const topK = opts.topK ?? 5;
  const out: MatchCandidate[] = [];

  for (const c of candidates) {
    if (opts.caseType && c.case_type !== opts.caseType) continue;
    if (c.case_id === query.case_id) continue; // never match self

    const ss = subScores(query, c);
    const contributions: Record<string, number> = {};
    let num = 0;
    let den = 0;

    for (const [feat, weight] of Object.entries(W.weights)) {
      const s = ss[feat];
      if (s == null) continue; // available-case normalization: drop absent
      const contrib = weight * s;
      contributions[feat] = Math.round(contrib * 100 * 100) / 100;
      num += contrib;
      den += weight;
    }

    if (den === 0) continue; // nothing comparable
    let score = (num / den) * 100;

    // --- hard rules ---
    // mobile exact match floors the score.
    const qm = digits(query.mobile);
    const cm = digits(c.mobile);
    if (qm && cm && qm === cm) {
      score = Math.max(score, W.hard_rules.mobile_exact_floor);
    }
    // gender + far-apart age => cap (likely not the same person).
    const apart = bandsApart(query.age_band, c.age_band);
    const genderMismatch =
      norm(query.gender) && norm(c.gender) && norm(query.gender) !== norm(c.gender);
    if (
      genderMismatch &&
      apart != null &&
      apart >= W.hard_rules.gender_age_mismatch_bands_apart
    ) {
      score = Math.min(score, W.hard_rules.gender_age_mismatch_cap);
    }

    out.push({
      case_id: c.case_id,
      score: Math.round(score * 100) / 100,
      contributions,
      rationale: null,
      case: c,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, topK);
}

function digits(s?: string | null): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Scoring thresholds mirrored from the contract (for UI badges). */
export const thresholds = W.thresholds;
