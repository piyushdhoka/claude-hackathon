"""Claude VISION analysis — CONTRACT STUB (implemented by the visual agent).

Turns a captured photo of a found/missing person into a structured, comparable
VISUAL DESCRIPTION + attributes, in the family's language. This is the strongest
signal for nameless cases and feeds both the UI and the match engine.

Public contract:

    analyze_image(image_b64, media_type="image/jpeg", language="en",
                  structured_gender=None, structured_age=None) -> dict
        -> {
             "visual_description": str,   # natural language, localized to `language`
             "attributes": {              # maps onto models.Attributes visual fields
                 clothing_colors[], clothing_type, marks[], build, hair, complexion,
                 headwear, footwear, accessories[], apparent_gender, apparent_age_band,
                 visual_quality
             },
             "contradicts_structured": bool
           }

    available() -> bool

Implementation notes for the agent:
- Opus 4.8 is multimodal: send an image content block (base64) + a strict tool-use
  schema, same robust pattern as enrich.claude.extract_attributes.
- Localize `visual_description` into `language` (10 supported languages).
- PRIVACY: callers store the returned attributes + (optionally) a face EMBEDDING,
  NOT the raw image, in the matchable store. The image is transient (human-confirm
  only) and purged after reunion.
- Degrade gracefully: on any failure return a safe empty default; never raise.
"""
from __future__ import annotations

from typing import Any

from ..config import settings


def available() -> bool:
    return bool(settings.anthropic_api_key)


def analyze_image(
    image_b64: str,
    media_type: str = "image/jpeg",
    language: str = "en",
    structured_gender: str | None = None,
    structured_age: str | None = None,
) -> dict[str, Any]:
    raise NotImplementedError("enrich.vision.analyze_image not yet implemented")
