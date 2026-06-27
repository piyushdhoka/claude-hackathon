"""Match API. /match (find candidates) and /dedupe (duplicate check)."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body, Header, Query

from . import engine

router = APIRouter(prefix="/match", tags=["match"])


@router.post("")
def match(
    query: dict[str, Any] = Body(...),
    case_type: Optional[str] = Query(None, description="pool to match against, e.g. 'missing'"),
    top_k: int = Query(5, le=25),
    x_role: Optional[str] = Header(default=None),
):
    """Rank candidates for a new/found person across all centers."""
    cands = engine.find_matches(query, case_type=case_type, top_k=top_k)
    return [c.model_dump() for c in cands]


@router.post("/dedupe")
def dedupe(
    query: dict[str, Any] = Body(...),
    top_k: int = Query(5, le=25),
):
    """Duplicate detection: same case_type, different center, high score."""
    qtype = query.get("case_type", "missing")
    cands = engine.find_matches(query, case_type=qtype, top_k=top_k)
    same_center = query.get("reporting_center")
    dupes = [c for c in cands if (c.case and c.case.get("reporting_center") != same_center)]
    return [c.model_dump() for c in dupes]
