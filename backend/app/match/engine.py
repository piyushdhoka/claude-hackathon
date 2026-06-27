"""Deterministic match engine — CONTRACT STUB (to be implemented by the match agent).

Public contract other modules depend on:

    find_matches(query: dict, *, case_type: str | None, top_k: int = 5,
                 limit_pool: int | None = None) -> list[MatchCandidate]

- `query` is a Case-shaped dict (the new/found person).
- `case_type` filters the pool to match against (e.g. query is 'found' -> pool 'missing').
- Returns ranked MatchCandidate with `score` (0..100) and per-feature `contributions`.

Implementation notes for the agent:
- Blocking: gender x age_band(+-1) x geo-bucket, UNION surname-exact and mobile-exact.
- Features + weights live in shared/match_weights.json (single source of truth,
  also consumed by the frontend JS matcher). Load them, don't hardcode.
- Available-case normalization: drop absent features from BOTH numerator and denominator.
- Hard rules: exact mobile -> floor 92; gender hard-mismatch AND age >=2 bands apart -> cap 25.
- Duplicate detection = same engine within same case_type across different centers.
"""
from __future__ import annotations

from typing import Any, Optional

from ..models import MatchCandidate


def find_matches(
    query: dict[str, Any],
    *,
    case_type: Optional[str] = None,
    top_k: int = 5,
    limit_pool: Optional[int] = None,
) -> list[MatchCandidate]:
    raise NotImplementedError("match.engine.find_matches not yet implemented")
