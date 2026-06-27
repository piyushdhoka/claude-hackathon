"""Fusion: combine per-feature scores into a single 0..100 score.

Two pieces:
  * ``fuse`` — weighted average with available-case normalization. Features whose
    value is ``None`` (inputs absent on either side) are dropped from BOTH the
    numerator and the denominator, so a record missing a name/mobile is scored
    only on what it *does* have, not penalized to zero.
  * ``apply_hard_rules`` — deterministic overrides from match_weights.json:
        - exact mobile match  -> score floored at ``mobile_exact_floor`` (92)
        - hard gender mismatch (male vs female, neither unknown) AND age >= N
          bands apart -> score capped at ``gender_age_mismatch_cap`` (25)
"""
from __future__ import annotations

from typing import Any, Optional

from . import features as F


def fuse(scores: dict[str, Optional[float]], weights: dict[str, float]) -> tuple[float, dict[str, float]]:
    """Weighted average over present features, rescaled to 0..100.

    Returns (score_0_100, contributions) where each contribution is that
    feature's *weighted points on the 0..100 scale* (sums to the raw score
    before hard rules) — ready for the explainability UI.
    """
    num = 0.0
    den = 0.0
    for feat, w in weights.items():
        s = scores.get(feat)
        if s is None:
            continue  # available-case normalization: drop from num AND den
        num += w * s
        den += w
    if den == 0:
        return 0.0, {}
    raw = num / den  # 0..1, normalized over present features only
    score = raw * 100.0
    # Contributions on the 0..100 scale, normalized the same way as the score so
    # they sum to `score`. This makes the bars in the UI add up to the headline.
    contributions: dict[str, float] = {}
    for feat, w in weights.items():
        s = scores.get(feat)
        if s is None:
            continue
        contributions[feat] = round((w * s) / den * 100.0, 2)
    return score, contributions


def apply_hard_rules(
    score: float,
    query: dict[str, Any],
    candidate: dict[str, Any],
    rules: dict[str, Any],
    order: list[str],
) -> tuple[float, list[str]]:
    """Apply deterministic floors/caps. Returns (adjusted_score, applied_flags)."""
    applied: list[str] = []

    # --- exact mobile match -> floor ---
    qmob = F.normalize_mobile(query.get("mobile"))
    cmob = F.normalize_mobile(candidate.get("mobile"))
    if qmob and cmob and qmob == cmob:
        floor = float(rules.get("mobile_exact_floor", 92))
        if score < floor:
            score = floor
        applied.append("mobile_exact_floor")

    # --- hard gender mismatch + age far apart -> cap ---
    qg = F.normalize_gender(query.get("gender"))
    cg = F.normalize_gender(candidate.get("gender"))
    if qg != "unknown" and cg != "unknown" and qg != cg:
        bands_apart = F.age_band_distance(query.get("age_band"), candidate.get("age_band"), order)
        threshold = int(rules.get("gender_age_mismatch_bands_apart", 2))
        if bands_apart is not None and bands_apart >= threshold:
            cap = float(rules.get("gender_age_mismatch_cap", 25))
            if score > cap:
                score = cap
            applied.append("gender_age_mismatch_cap")

    return score, applied
