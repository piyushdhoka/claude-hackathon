// Offline-aware data layer for Search & Match.
//
// This is the seam that makes offline-first REAL for the search surfaces:
//   - ONLINE  -> hit the backend AND warm the local mirror, so a later snan-day
//                blackout still has data to search.
//   - OFFLINE -> read the Dexie mirror and rank with the in-browser matcher
//                (match-lite), which mirrors shared/match_weights.json exactly,
//                so offline results are consistent with the server.
//
// Pages call loadCases()/runMatch() with the current `online` flag (the demo
// nav toggle + navigator.onLine) and never have to branch themselves.
import { api } from "./api";
import type { Case, MatchCandidate } from "./types";
import {
  dbAvailable,
  pullCases,
  readMirroredCases,
} from "./offline";
import { rankMatches } from "./match-lite";

// How many cases to warm into the mirror while online (backend caps at 1000).
const MIRROR_WARM_LIMIT = 1000;

/**
 * Load cases for browsing. Online: fetch + warm the mirror, return fresh data
 * (falling back to the mirror if the request fails). Offline: read the mirror.
 */
export async function loadCases(
  params: { case_type?: string; status?: string; limit?: number } = {},
  role: "operator" | "supervisor" = "operator",
  online = true
): Promise<{ cases: Case[]; source: "live" | "mirror" }> {
  if (online) {
    try {
      const cases = await api.listCases({ limit: MIRROR_WARM_LIMIT, ...params }, role);
      // Warm the mirror in the background for later offline use.
      if (dbAvailable()) void pullCases({ limit: MIRROR_WARM_LIMIT, ...params }, role);
      return { cases, source: "live" };
    } catch {
      // fall through to the mirror
    }
  }
  const cases = await readMirroredCases({
    case_type: params.case_type,
    status: params.status,
  });
  return { cases, source: "mirror" };
}

/**
 * Rank matches for a query against the opposite pool. Online: the full server
 * engine (Claude-enrichable). Offline (or server unreachable): the in-browser
 * matcher over the mirror.
 */
export async function runMatch(
  query: Partial<Case>,
  caseType: string,
  online = true,
  topK = 5
): Promise<{ matches: MatchCandidate[]; source: "live" | "mirror" }> {
  if (online) {
    try {
      const matches = await api.match(query, caseType, topK);
      return { matches, source: "live" };
    } catch {
      // fall through to offline ranking
    }
  }
  const pool = await readMirroredCases({ case_type: caseType });
  const matches = rankMatches(query, pool, {
    caseType: caseType as Case["case_type"],
    topK,
  });
  return { matches, source: "mirror" };
}
