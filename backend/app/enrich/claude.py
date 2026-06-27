"""Claude enrichment — CONTRACT STUB (to be implemented by the enrichment agent).

Public contract:

    extract_attributes(description: str, remarks: str | None,
                       structured_gender: str | None, structured_age: str | None) -> dict
        -> {clothing_colors[], clothing_type, marks[], mobility_confusion_flags[],
            apparent_gender, desc_quality, contradicts_structured}

    explain_match(query: dict, candidate: dict, contributions: dict,
                  score: float, language: str) -> str
        -> faithful, localized one/two-line rationale. MUST narrate only the supplied
           contributions/score; never invent a number.

    translate(strings: dict[str,str], target_language: str) -> dict[str,str]
        -> Claude-powered multilingual translation of UI/wizard/voice-prompt strings into
           any of the 10 languages. Used to localize the phoneless console + spoken prompts.

    available() -> bool   # True if ANTHROPIC_API_KEY present

Implementation notes for the agent:
- extract_attributes: Haiku (settings.claude_extract_model), strict tool-use JSON
  schema (additionalProperties: False), prompt caching on the stable schema/few-shots.
  Flag contradictions (e.g. structured 'Male' vs description 'woman in green saree').
- explain_match: Sonnet (settings.claude_explain_model). System prompt pins output to
  the evidence object; output in the requested language.
- EVERYTHING here is OPTIONAL enrichment. If the key is missing or the call fails,
  callers must degrade gracefully (return {} / "" ). Never raise to the hot path.
- Cache results keyed by record/pair so repeat lookups stay cheap.
"""
from __future__ import annotations

from typing import Any

from ..config import settings


def available() -> bool:
    return bool(settings.anthropic_api_key)


def extract_attributes(
    description: str | None,
    remarks: str | None = None,
    structured_gender: str | None = None,
    structured_age: str | None = None,
) -> dict[str, Any]:
    raise NotImplementedError("enrich.claude.extract_attributes not yet implemented")


def explain_match(
    query: dict[str, Any],
    candidate: dict[str, Any],
    contributions: dict[str, float],
    score: float,
    language: str = "Hindi",
) -> str:
    raise NotImplementedError("enrich.claude.explain_match not yet implemented")


def translate(strings: dict[str, str], target_language: str) -> dict[str, str]:
    raise NotImplementedError("enrich.claude.translate not yet implemented")
