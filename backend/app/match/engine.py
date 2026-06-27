"""Deterministic match engine — the hero feature.

The SAME engine does two jobs:
  * cross-center matching  (query 'found' -> pool 'missing', reunion)
  * duplicate detection    (query 'missing' -> pool 'missing', different center)

Public contract (other modules depend on this signature — do not change it):

    find_matches(query, *, case_type=None, top_k=5, limit_pool=None)
        -> list[MatchCandidate]

Pipeline:
  1. Normalize        (names, mobiles, age bands — in features.py)
  2. Blocking         (gender x age_band+-1 x geo-bucket  U  surname  U  mobile)
  3. Features         (each 0..1, or None when inputs are absent on either side)
  4. Available-case normalization  (drop absent features from num AND den)
  5. Hard rules       (mobile-exact floor; gender+age hard-mismatch cap)
  6. Fuse to 0..100   (+ per-feature `contributions` for the explainability UI)

Weights, sub-score rules, hard rules, thresholds and the age-band order all come
from shared/match_weights.json (single source of truth, also read by the JS
matcher) — nothing is hardcoded.
"""
from __future__ import annotations

from typing import Any, Iterable, Optional

from ..models import MatchCandidate
from ..registry import store
from . import blocking
from . import features as F
from . import fusion

# Features computed per (query, candidate) pair. Keys must match weight keys.
_FEATURE_KEYS = (
    "name_fuzzy", "name_phonetic", "gender", "age_band", "geo",
    "time", "language", "state_district", "description",
    "visual",
)


def _default_case_type(query: dict[str, Any], case_type: Optional[str]) -> str:
    """Resolve the pool type. Explicit case_type wins; else cross-type for a
    'found' query (-> 'missing'), and same-type otherwise (dedupe default)."""
    if case_type:
        return case_type
    qtype = (query.get("case_type") or "missing")
    return "missing" if qtype == "found" else qtype


def _compute_scores(
    query: dict[str, Any],
    cand: dict[str, Any],
    weights_doc: dict[str, Any],
) -> dict[str, Optional[float]]:
    sub = weights_doc["sub_scores"]
    order = weights_doc["age_band_order"]

    qname = F.normalize_name(query.get("name"))
    cname = F.normalize_name(cand.get("name"))

    return {
        "name_fuzzy": F.score_name_fuzzy(qname, cname),
        "name_phonetic": F.score_name_phonetic(qname, cname),
        "gender": F.score_gender(query.get("gender"), cand.get("gender"), sub["gender"]),
        "age_band": F.score_age_band(query.get("age_band"), cand.get("age_band"),
                                     sub["age_band"], order),
        "geo": F.score_geo(query.get("lat"), query.get("lng"),
                           cand.get("lat"), cand.get("lng"), sub["geo"]),
        "time": F.score_time(query.get("reported_at"), cand.get("reported_at"), sub["time"]),
        "language": F.score_language(query.get("language"), cand.get("language")),
        "state_district": F.score_state_district(
            query.get("state"), query.get("district"),
            cand.get("state"), cand.get("district"), sub["state_district"]),
        "description": F.score_description(query.get("description"), cand.get("description")),
        # Visual: overlap of Claude-vision attributes. Returns None (dropped) unless
        # BOTH sides carry photo-derived attributes, so text-only cases are unaffected.
        "visual": F.score_visual(query.get("attributes"), cand.get("attributes")),
    }


def score_pair(
    query: dict[str, Any],
    cand: dict[str, Any],
    weights_doc: Optional[dict[str, Any]] = None,
) -> tuple[float, dict[str, float]]:
    """Score one (query, candidate) pair -> (score 0..100, contributions).

    Exposed for eval/tests; ``find_matches`` uses it internally.
    """
    weights_doc = weights_doc or F.load_weights()
    order = weights_doc["age_band_order"]
    scores = _compute_scores(query, cand, weights_doc)
    score, contributions = fusion.fuse(scores, weights_doc["weights"])
    score, applied = fusion.apply_hard_rules(
        score, query, cand, weights_doc["hard_rules"], order)
    if applied:
        for flag in applied:
            contributions[f"_rule:{flag}"] = round(score, 2)
    return score, contributions


def find_matches(
    query: dict[str, Any],
    *,
    case_type: Optional[str] = None,
    top_k: int = 5,
    limit_pool: Optional[int] = None,
    pool: Optional[Iterable[dict[str, Any]]] = None,
) -> list[MatchCandidate]:
    """Rank pool candidates for a query. See module docstring for the pipeline.

    ``pool`` may be injected (eval/tests with a synthetic pool); otherwise the
    candidates are streamed from the registry store for the resolved case_type.
    The query's own ``case_id`` is always excluded (so dedupe never self-matches).
    """
    weights_doc = F.load_weights()
    order = weights_doc["age_band_order"]
    resolved_type = _default_case_type(query, case_type)

    # --- load the pool ---
    if pool is not None:
        pool_docs = list(pool)
    else:
        pool_docs = list(store.iter_cases(resolved_type))
    if limit_pool is not None:
        pool_docs = pool_docs[:limit_pool]

    qid = query.get("case_id")
    pool_docs = [d for d in pool_docs if d.get("case_id") != qid]

    # --- blocking ---
    index = blocking.build_index(pool_docs, order)
    cand_ids = index.candidates(query)

    # --- score each candidate ---
    results: list[MatchCandidate] = []
    for cid in cand_ids:
        cand = index.by_id[cid]
        score, contributions = score_pair(query, cand, weights_doc)
        results.append(MatchCandidate(
            case_id=cid,
            score=round(score, 2),
            contributions=contributions,
            case=store.mask_case(cand),
        ))

    # --- rank: score desc, then case_id for deterministic ties ---
    results.sort(key=lambda c: (-c.score, c.case_id))
    return results[:top_k]
