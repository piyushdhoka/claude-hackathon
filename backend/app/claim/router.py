"""F6 Claim-fraud API. POST /claim/assess — gate a claim before PII reveal."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from ..registry import store
from . import service

router = APIRouter(prefix="/claim", tags=["claim"])


@router.post("/assess")
def assess(payload: dict[str, Any] = Body(...)):
    """Score a claim for fraud and log the decision. Returns the gating verdict;
    a non-clear band blocks auto-reveal and routes to a supervisor."""
    case_id = payload.get("case_id")
    case = store.get_case(case_id) if case_id else None
    if not case:
        raise HTTPException(404, "case not found")
    claim = payload.get("claim") or {}
    history = payload.get("history") or []
    return service.process_claim(claim, case, history=history)
