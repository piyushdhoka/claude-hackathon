"""Face-match API (feature-flagged). Returns 501 when FACE_MATCH_ENABLED is false."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import settings

router = APIRouter(prefix="/face", tags=["face"])


@router.get("/status")
def status():
    return {"face_match_enabled": settings.face_match_enabled}


@router.post("/search")
def search():
    if not settings.face_match_enabled:
        raise HTTPException(503, "face matching disabled (set FACE_MATCH_ENABLED=true)")
    raise HTTPException(501, "face service not yet implemented")
