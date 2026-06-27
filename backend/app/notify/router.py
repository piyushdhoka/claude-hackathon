"""F1 Notify API. POST /notify/match — alert a family that their person is found."""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from ..registry import store
from . import service

router = APIRouter(prefix="/notify", tags=["notify"])


@router.post("/match")
def notify_match(payload: dict = Body(...)):
    """Send the reporter of ``case_id`` a localized found-safe message + claim
    code. The raw number is never returned — only a masked form."""
    case_id = payload.get("case_id")
    case = store.get_case(case_id) if case_id else None
    if not case:
        raise HTTPException(404, "case not found")
    return service.notify_match(
        case,
        center=payload.get("center", "the help center"),
        code=payload.get("code", "------"),
    )
