"""Claude VISION analysis (Opus 4.8, multimodal).

Turns a captured photo of a found/missing person into a structured, comparable
VISUAL DESCRIPTION + attributes, localized into the family's language. This is
the strongest signal for nameless cases and feeds both the UI and the match
engine (match.features.score_visual).

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

Design (same robust pattern as enrich.claude.extract_attributes):
- Opus 4.8 is multimodal: the image is sent as a base64 `image` content block,
  followed by the instructions, and a STRICT tool-use schema (additionalProperties
  False + required + strict=True) guarantees the tool_use.input shape.
- Adaptive thinking only (Opus 4.8): thinking={"type": "adaptive"}; no sampling
  params (they 400 on 4.8).
- Prompt caching: the stable system prompt carries cache_control so repeat
  analyses reuse the cached prefix. The per-image content goes after it.
- PRIVACY: returns ATTRIBUTES + a description only. The raw image is NEVER
  persisted by this function — callers store the returned attributes (+ optionally
  a face EMBEDDING from face.service), not the photo.
- Degrades gracefully: on ANY failure (offline / missing key / API error / refusal
  / bad output) returns a safe empty default; never raises.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any

from ..config import settings
from . import claude  # reuse the lazily-built client, sanitizer, and tool parser

logger = logging.getLogger("setu.enrich.vision")

_MAX_TOKENS = 2048

# In-memory cache keyed by (image hash, language, structured fields). The image
# is hashed — never stored — so repeat analyses of the same photo are free.
_vision_cache: dict[str, dict[str, Any]] = {}

# Accepted media types for the base64 image block.
_ALLOWED_MEDIA = {"image/jpeg", "image/png", "image/gif", "image/webp"}

VISION_TOOL_NAME = "record_visual_attributes"

VISION_TOOL_DESCRIPTION = (
    "Record the structured visual attributes observed in a photo of a "
    "missing/found person, plus a natural-language description. Call this exactly "
    "once with only what is actually VISIBLE in the image."
)

# Strict JSON schema. additionalProperties:false + required + strict tool use =>
# tool_use.input validates this shape exactly.
VISION_INPUT_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "visual_description": {
            "type": "string",
            "description": (
                "A short, natural-language description (1-3 sentences) of the "
                "person as they appear in the photo, written for a family member "
                "to recognise them. MUST be written in the requested target "
                "language using that language's native script. Describe only what "
                "is visible; do not guess identity, name, or caste."
            ),
        },
        "clothing_colors": {
            "type": "array",
            "items": {"type": "string"},
            "description": 'Lowercase colour words for visible clothing (e.g. ["white","saffron"]). Empty if unclear.',
        },
        "clothing_type": {
            "type": "string",
            "description": 'Most salient garment, normalized (e.g. "saree", "dhoti", "kurta", "shirt"). Empty string if unclear.',
        },
        "marks": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Visible distinguishing marks: tilak, scar, mole, spectacles, "
                "bindi, beard, missing limb, bandage, etc. Empty if none visible."
            ),
        },
        "build": {
            "type": "string",
            "description": 'Body build if discernible: one of "slim", "average", "heavy", "frail". Empty string if unclear.',
        },
        "hair": {
            "type": "string",
            "description": 'Hair appearance, normalized (e.g. "grey", "bald", "black", "white", "braided", "short"). Empty string if unclear.',
        },
        "complexion": {
            "type": "string",
            "description": 'Skin complexion if discernible (e.g. "fair", "medium", "dark", "wheatish"). Empty string if unclear.',
        },
        "headwear": {
            "type": "string",
            "description": 'Headwear if visible (e.g. "turban", "cap", "scarf", "pallu", "topi"). Empty string if none.',
        },
        "footwear": {
            "type": "string",
            "description": 'Footwear if visible (e.g. "sandals", "barefoot", "shoes", "slippers"). Empty string if unclear.',
        },
        "accessories": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Carried/worn accessories: walking stick, bag, jewellery, "
                "rudraksha, glasses, watch, umbrella, etc. Empty if none visible."
            ),
        },
        "apparent_gender": {
            "type": "string",
            "enum": ["male", "female", "unknown"],
            "description": "Gender APPARENT FROM THE IMAGE ALONE. 'unknown' if not determinable. Do NOT copy the structured gender field.",
        },
        "apparent_age_band": {
            "type": "string",
            "enum": ["0-12", "13-17", "18-40", "41-60", "61-70", "71-80", "80+", "unknown"],
            "description": "Best-estimate age band from the person's apparent age in the photo. 'unknown' if not determinable.",
        },
        "visual_quality": {
            "type": "string",
            "enum": ["good", "partial", "poor"],
            "description": (
                "Usability of the photo for visual/face matching: 'good' = clear, "
                "well-lit, face visible; 'partial' = face partly visible/occluded/"
                "angled; 'poor' = blurry, dark, tiny, or no clear face."
            ),
        },
        "contradicts_structured": {
            "type": "boolean",
            "description": (
                "True if the apparent gender or age in the photo clearly conflicts "
                "with the supplied structured gender/age fields. False if "
                "consistent, if there is nothing to compare against, or if the "
                "image gives no clear conflicting cue."
            ),
        },
    },
    "required": [
        "visual_description",
        "clothing_colors",
        "clothing_type",
        "marks",
        "build",
        "hair",
        "complexion",
        "headwear",
        "footwear",
        "accessories",
        "apparent_gender",
        "apparent_age_band",
        "visual_quality",
        "contradicts_structured",
    ],
}

# Safe default returned on ANY failure. Mirrors the attribute keys so the caller
# (and models.Attributes) always sees a complete, well-typed shape.
_DEFAULT_ATTRS: dict[str, Any] = {
    "clothing_colors": [],
    "clothing_type": "",
    "marks": [],
    "build": "",
    "hair": "",
    "complexion": "",
    "headwear": "",
    "footwear": "",
    "accessories": [],
    "apparent_gender": "unknown",
    "apparent_age_band": "unknown",
    "visual_quality": "poor",
}

VISION_DEFAULT: dict[str, Any] = {
    "visual_description": "",
    "attributes": dict(_DEFAULT_ATTRS),
    "contradicts_structured": False,
}


def _default() -> dict[str, Any]:
    """A fresh deep-ish copy of the safe default (never share mutable inner dicts)."""
    return {
        "visual_description": "",
        "attributes": dict(_DEFAULT_ATTRS),
        "contradicts_structured": False,
    }


VISION_SYSTEM = (
    "You are a careful visual-attribute observer for Setu, a missing-persons "
    "reunification system at the Kumbh Mela (mostly elderly, non-literate, "
    "phoneless pilgrims). You are shown ONE photo of a lost or found person and "
    "you record structured, comparable visual attributes plus a short natural-"
    "language description, by calling the record_visual_attributes tool exactly "
    "once.\n\n"
    "RULES:\n"
    "1. Report ONLY what is visibly present in the image. Never invent clothing, "
    "colours, marks, or conditions that are not actually visible. If a field is "
    "not determinable, use the empty string / empty list / 'unknown'.\n"
    "2. Do NOT guess the person's name, identity, caste, religion, or any "
    "sensitive inference beyond plainly visible attributes.\n"
    "3. Write visual_description in the requested TARGET LANGUAGE using that "
    "language's native script — warm, simple, recognisable to a family member. "
    "Keep it to 1-3 sentences.\n"
    "4. Set contradicts_structured=true only when the apparent gender or age "
    "clearly conflicts with the supplied structured fields.\n"
    "5. Judge visual_quality honestly — it tells the operator whether the photo "
    "is usable for face matching.\n"
    "PRIVACY: you are extracting attributes only; the raw photo is transient and "
    "is never stored in the matchable record."
)


def available() -> bool:
    return bool(settings.anthropic_api_key)


def _coerce(data: dict[str, Any]) -> dict[str, Any]:
    """Defensively shape tool output to the contract.

    Uses claude._clean_str to blank any leaked tool-call markup (the same Opus
    4.8 quirk fixed in extract_attributes), so no field propagates malformed text.
    """
    clean = claude._clean_str  # markup-leak-safe string coercion

    def _str_list(v: Any) -> list[str]:
        if isinstance(v, list):
            return [c for c in (clean(x) for x in v) if c]
        return []

    attrs = dict(_DEFAULT_ATTRS)
    attrs["clothing_colors"] = [c.lower() for c in _str_list(data.get("clothing_colors"))]
    attrs["marks"] = _str_list(data.get("marks"))
    attrs["accessories"] = _str_list(data.get("accessories"))
    attrs["clothing_type"] = clean(data.get("clothing_type"))
    attrs["build"] = clean(data.get("build"))
    attrs["hair"] = clean(data.get("hair"))
    attrs["complexion"] = clean(data.get("complexion"))
    attrs["headwear"] = clean(data.get("headwear"))
    attrs["footwear"] = clean(data.get("footwear"))

    gender = clean(data.get("apparent_gender")).lower()
    attrs["apparent_gender"] = gender if gender in ("male", "female", "unknown") else "unknown"

    band = clean(data.get("apparent_age_band"))
    _bands = {"0-12", "13-17", "18-40", "41-60", "61-70", "71-80", "80+", "unknown"}
    attrs["apparent_age_band"] = band if band in _bands else "unknown"

    quality = clean(data.get("visual_quality")).lower()
    attrs["visual_quality"] = quality if quality in ("good", "partial", "poor") else "poor"

    return {
        "visual_description": clean(data.get("visual_description")),
        "attributes": attrs,
        "contradicts_structured": bool(data.get("contradicts_structured", False)),
    }


def analyze_image(
    image_b64: str,
    media_type: str = "image/jpeg",
    language: str = "en",
    structured_gender: str | None = None,
    structured_age: str | None = None,
) -> dict[str, Any]:
    """Analyze a captured photo into a localized visual description + attributes.

    Returns the contract dict; on ANY failure returns a safe empty default
    (never raises). The raw image is hashed for caching and otherwise discarded.
    """
    if not image_b64 or not isinstance(image_b64, str):
        return _default()

    media_type = (media_type or "image/jpeg").strip().lower()
    if media_type not in _ALLOWED_MEDIA:
        media_type = "image/jpeg"

    language = (language or "en").strip() or "en"

    # Cache by image content hash + the inputs that change the output. The hash
    # means we keep no copy of the image bytes around for caching.
    img_hash = hashlib.sha256(image_b64.encode("utf-8")).hexdigest()
    key = claude._hash("vision", img_hash, media_type, language, structured_gender, structured_age)
    if key in _vision_cache:
        return _copy_result(_vision_cache[key])

    client = claude._get_client()
    if client is None:
        return _default()

    instructions = (
        "TARGET LANGUAGE for visual_description: "
        f"{language}\n\n"
        "STRUCTURED FIELDS (from the registry form — may conflict with the photo):\n"
        f"  gender: {structured_gender or 'unknown'}\n"
        f"  age: {structured_age or 'unknown'}\n\n"
        "Look at the photo above and call record_visual_attributes once with only "
        "what is visibly present. Write visual_description in the target language."
    )

    try:
        response = client.messages.create(
            model=settings.claude_extract_model,  # Opus 4.8 (multimodal)
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            # Stable prefix carries cache_control (tools render before system, so
            # the tool schema + system text are cached together).
            system=[
                {
                    "type": "text",
                    "text": VISION_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[
                {
                    "name": VISION_TOOL_NAME,
                    "description": VISION_TOOL_DESCRIPTION,
                    "strict": True,
                    "input_schema": VISION_INPUT_SCHEMA,
                }
            ],
            tool_choice={"type": "tool", "name": VISION_TOOL_NAME},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": instructions},
                    ],
                }
            ],
        )
    except Exception as exc:  # offline / API error / bad image -> safe default
        logger.warning("analyze_image API error: %s", exc)
        return _default()

    if getattr(response, "stop_reason", None) == "refusal":
        return _default()

    data = claude._tool_input(response, VISION_TOOL_NAME)
    if not data:
        return _default()

    result = _coerce(data)
    _vision_cache[key] = result
    return _copy_result(result)


def _copy_result(result: dict[str, Any]) -> dict[str, Any]:
    """Return a copy that doesn't share the cached inner dicts/lists."""
    return {
        "visual_description": result.get("visual_description", ""),
        "attributes": dict(result.get("attributes", {})),
        "contradicts_structured": bool(result.get("contradicts_structured", False)),
    }


# --------------------------------------------------------------------------- #
# compare_photos — Claude-vision same-person assist (human-in-the-loop)         #
# --------------------------------------------------------------------------- #
# This replaces a biometric face model: rather than auto-deciding identity, it
# gives the operator a SECOND OPINION on whether two photos show the same person,
# with a localized rationale. The human + family always make the final call.
COMPARE_TOOL_NAME = "compare_persons"

COMPARE_INPUT_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "required": ["verdict", "confidence", "reasoning"],
    "properties": {
        "verdict": {
            "type": "string",
            "enum": ["likely_same", "likely_different", "uncertain"],
        },
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "reasoning": {
            "type": "string",
            "description": "One or two short sentences citing the visible evidence "
            "(face shape, age, build, distinctive marks), in the target language.",
        },
    },
}

COMPARE_SYSTEM = (
    "You assist humanitarian reunification volunteers at Kumbh Mela by giving a "
    "SECOND OPINION on whether two photos show the SAME person. You are assistive "
    "only — a human and the family always confirm. Compare faces and stable "
    "features (face shape, apparent age, build, distinctive marks); ignore "
    "differences explained by lighting, angle, or expression. Be honest: if the "
    "photos are too poor or partial, answer 'uncertain'. Never claim certainty "
    "you do not have. Report via the compare_persons tool only."
)

_compare_cache: dict[str, dict[str, Any]] = {}

_COMPARE_DEFAULT = {"verdict": "uncertain", "confidence": 0.0, "reasoning": ""}


def compare_photos(
    image_a_b64: str,
    image_b_b64: str,
    language: str = "en",
    media_type_a: str = "image/jpeg",
    media_type_b: str = "image/jpeg",
) -> dict[str, Any]:
    """Compare two photos for same-person, returning {verdict, confidence, reasoning}.

    Assistive only. On any failure returns a safe 'uncertain' default; never raises.
    """
    if not image_a_b64 or not image_b_b64:
        return dict(_COMPARE_DEFAULT)

    ma = media_type_a if media_type_a in _ALLOWED_MEDIA else "image/jpeg"
    mb = media_type_b if media_type_b in _ALLOWED_MEDIA else "image/jpeg"
    language = (language or "en").strip() or "en"

    key = claude._hash(
        "compare",
        hashlib.sha256(image_a_b64.encode()).hexdigest(),
        hashlib.sha256(image_b_b64.encode()).hexdigest(),
        language,
    )
    if key in _compare_cache:
        return dict(_compare_cache[key])

    client = claude._get_client()
    if client is None:
        return dict(_COMPARE_DEFAULT)

    try:
        response = client.messages.create(
            model=settings.claude_explain_model,  # Opus 4.8 (multimodal)
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=[{"type": "text", "text": COMPARE_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            tools=[{"name": COMPARE_TOOL_NAME, "strict": True,
                    "input_schema": COMPARE_INPUT_SCHEMA}],
            tool_choice={"type": "tool", "name": COMPARE_TOOL_NAME},
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": "PERSON A:"},
                    {"type": "image", "source": {"type": "base64", "media_type": ma, "data": image_a_b64}},
                    {"type": "text", "text": "PERSON B:"},
                    {"type": "image", "source": {"type": "base64", "media_type": mb, "data": image_b_b64}},
                    {"type": "text", "text": f"Are A and B the same person? "
                     f"Write reasoning in language: {language}. Call compare_persons once."},
                ],
            }],
        )
    except Exception as exc:
        logger.warning("compare_photos API error: %s", exc)
        return dict(_COMPARE_DEFAULT)

    if getattr(response, "stop_reason", None) == "refusal":
        return dict(_COMPARE_DEFAULT)

    data = claude._tool_input(response, COMPARE_TOOL_NAME)
    if not data:
        return dict(_COMPARE_DEFAULT)

    result = {
        "verdict": data.get("verdict", "uncertain"),
        "confidence": float(data.get("confidence", 0.0) or 0.0),
        "reasoning": claude._clean_str(data.get("reasoning", "")) if hasattr(claude, "_clean_str")
        else str(data.get("reasoning", "")),
    }
    _compare_cache[key] = result
    return dict(result)
