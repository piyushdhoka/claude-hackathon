"""Enrichment API: extract attributes, explain a match. Degrades gracefully offline."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Body

from . import claude, vision

router = APIRouter(prefix="/enrich", tags=["enrich"])


@router.get("/status")
def status():
    return {"claude_available": claude.available(), "vision_available": vision.available()}


@router.post("/vision")
def analyze_vision(payload: dict[str, Any] = Body(...)):
    """Analyze a captured photo into a localized visual description + attributes.
    payload: { image_b64, media_type?, language?, gender?, age_band? }"""
    if not vision.available() or not payload.get("image_b64"):
        return {"analyzed": False, "visual_description": None, "attributes": {}}
    try:
        return {"analyzed": True, **vision.analyze_image(
            payload["image_b64"],
            payload.get("media_type", "image/jpeg"),
            payload.get("language", "en"),
            payload.get("gender"),
            payload.get("age_band"),
        )}
    except NotImplementedError:
        return {"analyzed": False, "visual_description": None, "attributes": {}}


@router.post("/compare")
def compare(payload: dict[str, Any] = Body(...)):
    """Claude-vision same-person second opinion on two photos (human-in-the-loop).
    payload: { image_a_b64, image_b_b64, language? }"""
    if not vision.available() or not payload.get("image_a_b64") or not payload.get("image_b_b64"):
        return {"compared": False, "verdict": None, "confidence": None, "reasoning": None}
    res = vision.compare_photos(
        payload["image_a_b64"],
        payload["image_b_b64"],
        payload.get("language", "en"),
        payload.get("media_type_a", "image/jpeg"),
        payload.get("media_type_b", "image/jpeg"),
    )
    return {"compared": True, **res}


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
