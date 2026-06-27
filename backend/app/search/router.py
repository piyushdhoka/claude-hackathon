"""F4 Family self-search API. POST /search/family — describe a lost person."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Query

from . import service

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/family")
def family(
    payload: dict[str, Any] = Body(...),
    top_k: int = Query(5, le=25),
):
    """Walk-in family search: partial tap description -> ranked found-person
    candidates, masked for the family-facing view."""
    return service.search_family(payload, top_k=top_k)
