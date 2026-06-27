"""Enrichment API: extract attributes, explain a match. Degrades gracefully offline."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body

from . import claude

router = APIRouter(prefix="/enrich", tags=["enrich"])


@router.get("/status")
def status():
    return {"claude_available": claude.available()}


@router.post("/attributes")
def attributes(payload: dict[str, Any] = Body(...)):
    if not claude.available():
        return {"enriched": False, "attributes": {}}
    try:
        attrs = claude.extract_attributes(
            payload.get("description"),
            payload.get("remarks"),
            payload.get("gender"),
            payload.get("age_band"),
        )
        return {"enriched": True, "attributes": attrs}
    except NotImplementedError:
        return {"enriched": False, "attributes": {}}


@router.post("/translate")
def translate(payload: dict[str, Any] = Body(...)):
    """Claude-powered multilingual translation of UI/voice-prompt strings."""
    if not claude.available():
        return {"translated": False, "strings": payload.get("strings", {})}
    try:
        out = claude.translate(payload.get("strings", {}), payload.get("language", "Hindi"))
        return {"translated": True, "strings": out}
    except NotImplementedError:
        return {"translated": False, "strings": payload.get("strings", {})}


@router.post("/explain")
def explain(payload: dict[str, Any] = Body(...)):
    if not claude.available():
        return {"rationale": None}
    try:
        text = claude.explain_match(
            payload.get("query", {}),
            payload.get("candidate", {}),
            payload.get("contributions", {}),
            float(payload.get("score", 0)),
            payload.get("language", "Hindi"),
        )
        return {"rationale": text}
    except NotImplementedError:
        return {"rationale": None}
