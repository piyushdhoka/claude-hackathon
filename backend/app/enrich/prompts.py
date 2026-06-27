"""Prompt + schema constants for the Claude enrichment layer.

These are kept here (separate from claude.py) so the *stable* prefixes — system
prompts, tool/JSON schemas, few-shot examples — live in one place. Stability
matters: extract_attributes caches this prefix (tools -> system render first), so
any byte change here invalidates the cache. Treat these as frozen-ish constants.
"""
from __future__ import annotations

# The 10 supported languages for the phoneless console + spoken prompts.
SUPPORTED_LANGUAGES = (
    "Hindi",
    "Marathi",
    "Bengali",
    "Tamil",
    "Telugu",
    "Kannada",
    "Gujarati",
    "Maithili",
    "Bhojpuri",
    "Awadhi",
)

# --------------------------------------------------------------------------- #
# extract_attributes — strict tool-use schema                                 #
# --------------------------------------------------------------------------- #
# The dataset descriptions are messy, multilingual, template-y, and OFTEN
# contradict the structured fields (a Male record described as "woman in green
# saree"). The schema MUST surface that contradiction rather than trust either
# side blindly, and MUST capture mobility/confusion cues — the strongest
# reunification signals for phoneless, elderly, disoriented pilgrims.

EXTRACT_TOOL_NAME = "record_attributes"

EXTRACT_TOOL_DESCRIPTION = (
    "Record the structured attributes extracted from a missing/found person's "
    "free-text physical description. Call this exactly once with your best, "
    "evidence-grounded reading of the text."
)

# JSON Schema for the tool input. additionalProperties:false + strict tool use
# => the model's tool_use.input is guaranteed to validate exactly this shape.
EXTRACT_INPUT_SCHEMA: dict = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "clothing_colors": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Lowercase colour words for clothing actually mentioned "
                '(e.g. ["green","white"]). Empty list if none stated.'
            ),
        },
        "clothing_type": {
            "type": "string",
            "description": (
                "The single most salient garment/attire mentioned, normalized "
                '(e.g. "saree", "dhoti", "kurta", "shirt", "salwar kameez"). '
                'Empty string if none stated.'
            ),
        },
        "marks": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Distinguishing physical marks / accessories: scars, tilak, "
                "spectacles, walking stick, mole, tattoo, missing teeth, "
                "amputation, etc. Empty list if none stated."
            ),
        },
        "mobility_confusion_flags": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Short normalized cues about mobility, cognition, sensory or "
                "communication difficulty — the strongest reunification signals. "
                'Examples: "asking for Ramkund", "cannot remember name", '
                '"hard of hearing", "disoriented", "non-verbal", "uses cane", '
                '"wheelchair", "blind". Empty list if none present.'
            ),
        },
        "apparent_gender": {
            "type": "string",
            "enum": ["male", "female", "unknown"],
            "description": (
                "Gender IMPLIED BY THE DESCRIPTION TEXT ALONE (gendered attire, "
                "pronouns, words like man/woman). Use 'unknown' if the text gives "
                "no gender cue. Do NOT copy the structured gender field here."
            ),
        },
        "desc_quality": {
            "type": "string",
            "enum": ["rich", "sparse", "contradictory"],
            "description": (
                "'rich' = multiple concrete details; 'sparse' = little/generic "
                "info; 'contradictory' = the description's internal cues conflict "
                "with each other OR clearly conflict with the structured fields."
            ),
        },
        "contradicts_structured": {
            "type": "boolean",
            "description": (
                "True if the description's apparent gender (or other strong cue) "
                "clearly conflicts with the supplied structured gender/age — "
                "e.g. structured gender Male but description says 'woman in green "
                "saree'. False if consistent, or if there is no structured field "
                "to compare against, or the description gives no conflicting cue."
            ),
        },
    },
    "required": [
        "clothing_colors",
        "clothing_type",
        "marks",
        "mobility_confusion_flags",
        "apparent_gender",
        "desc_quality",
        "contradicts_structured",
    ],
}

# Safe default returned on any failure (offline / API error / refusal / parse).
EXTRACT_DEFAULT: dict = {
    "clothing_colors": [],
    "clothing_type": "",
    "marks": [],
    "mobility_confusion_flags": [],
    "apparent_gender": "unknown",
    "desc_quality": "sparse",
    "contradicts_structured": False,
}

# Stable system prompt for extraction. Few-shot guidance is embedded here so the
# whole prefix (tool schema + this system text) can be cached.
EXTRACT_SYSTEM = (
    "You are an attribute-extraction engine for Setu, a missing-persons "
    "reunification system at the Kumbh Mela. You read short, messy, often "
    "multilingual or template-generated physical descriptions of lost/found "
    "pilgrims (mostly elderly, non-literate, phoneless) and record structured "
    "attributes by calling the record_attributes tool exactly once.\n\n"
    "RULES:\n"
    "1. Extract ONLY what the text supports. Never invent colours, garments, "
    "marks, or conditions that are not stated or strongly implied.\n"
    "2. The free-text description OFTEN CONTRADICTS the structured gender/age. "
    "Do NOT silently trust either side. Report what the DESCRIPTION says in "
    "apparent_gender, and set contradicts_structured=true when the description "
    "clearly conflicts with the supplied structured fields (e.g. structured "
    "gender 'Male' but the text describes a 'woman in green saree').\n"
    "3. Mobility / confusion / sensory / memory cues are the most valuable "
    "signal for reunification — capture every one you see in "
    "mobility_confusion_flags (e.g. 'keeps asking for Ramkund', 'cannot "
    "remember name', 'hard of hearing', 'disoriented').\n"
    "4. Normalize: colours lowercase; clothing_type to a single canonical "
    "garment word; flags as short lowercase phrases.\n"
    "5. If the description is empty or gives nothing useful, return empty "
    "lists/strings, apparent_gender 'unknown', desc_quality 'sparse'."
)

# --------------------------------------------------------------------------- #
# explain_match — faithful, pinned, localized rationale                       #
# --------------------------------------------------------------------------- #
# The system prompt MUST pin output to the supplied evidence. The score is
# INPUT, never generated. Claude may never invent a number or a fact.

EXPLAIN_SYSTEM = (
    "You write a one or two line rationale explaining WHY a missing-person and "
    "a found-person record were matched, for a human reviewer at the Kumbh Mela "
    "reunification desk.\n\n"
    "ABSOLUTE RULES — these are non-negotiable:\n"
    "- You are given an EVIDENCE object: the match score and a per-feature "
    "contributions map (feature -> how much it added to the score). The score "
    "is GIVEN to you; you must NEVER compute, change, or invent a score or any "
    "other number.\n"
    "- Ground every claim in the supplied contributions and field values. Do "
    "NOT introduce any fact, attribute, name, location, or figure that is not "
    "present in the evidence.\n"
    "- Lead with the features that contributed most (highest contribution "
    "values). Be concrete (e.g. 'name and age match closely; same last-seen "
    "area').\n"
    "- Keep it to 1-2 short lines. No preamble, no 'Here is', no bullet points, "
    "no markdown. Output ONLY the rationale sentence(s).\n"
    "- Write the ENTIRE rationale in the requested target language, using that "
    "language's native script. Do not add a translation or transliteration."
)

# --------------------------------------------------------------------------- #
# translate — batch, key-preserving                                           #
# --------------------------------------------------------------------------- #
TRANSLATE_TOOL_NAME = "record_translations"

TRANSLATE_TOOL_DESCRIPTION = (
    "Record the translated UI strings. You MUST return exactly the same set of "
    "keys you were given, with each value translated into the target language."
)

TRANSLATE_SYSTEM = (
    "You are a UI/voice-prompt localizer for Setu, a phoneless missing-persons "
    "console used by non-literate, elderly pilgrims at the Kumbh Mela. Translate "
    "short interface labels and spoken prompts into the requested target "
    "language, using that language's native script.\n\n"
    "RULES:\n"
    "- Preserve EVERY key exactly; translate only the values.\n"
    "- Use simple, warm, spoken-style wording an elderly non-literate listener "
    "would understand — not bureaucratic register.\n"
    "- Keep any placeholders (e.g. {name}, {center}) intact and unchanged.\n"
    "- Do not add, drop, merge, or reorder keys. Do not add commentary."
)


def build_translate_schema(keys: list[str]) -> dict:
    """JSON Schema requiring exactly the given keys (key preservation by schema)."""
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {k: {"type": "string"} for k in keys},
        "required": list(keys),
    }
