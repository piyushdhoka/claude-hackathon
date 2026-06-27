"""Claude enrichment layer for Setu (Opus 4.8).

Three online, non-blocking capabilities — each degrades to a SAFE DEFAULT on any
failure (offline / missing key / API error / refusal / bad output). Nothing here
may ever raise to the hot path; the router already guards with available() and
NotImplementedError, but these functions ALSO swallow their own runtime errors.

  extract_attributes -> dict   (strict tool-use JSON schema; flags contradictions
                                 with the structured fields; captures mobility/
                                 confusion cues; prompt-cached stable prefix)
  explain_match      -> str     (faithful localized rationale, pinned to the
                                 supplied contributions/score — never invents a
                                 number or a fact)
  translate          -> dict    (batch, key-preserving UI/voice-prompt localization
                                 into any of the 10 supported languages)

Models come from settings (claude_*_model = "claude-opus-4-8"). A small in-memory
dict cache keyed by an input hash keeps repeat lookups free.

API surface notes (verified against the claude-api skill for Opus 4.8):
- Adaptive thinking only: thinking={"type": "adaptive"}. budget_tokens / sampling
  params would 400 and are not used.
- Strict tool use (strict=True on the tool, additionalProperties:false + required)
  guarantees tool_use.input validates the schema exactly — the robust path for
  "extract into this exact shape".
- Prompt caching is a prefix match (tools -> system -> messages). The stable
  schema + system prompt carry cache_control so repeat extractions hit the cache.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any

from ..config import settings
from . import prompts

logger = logging.getLogger("setu.enrich.claude")

# Opus 4.8 occasionally leaks its internal XML tool-call markup into a STRING
# field's value when that value is meant to be empty. The leaked value carries
# the model's own parameter-tag scaffolding, e.g. a clothing_type that should be
# "" comes back as a closing-param-tag fragment followed by the next field's
# opening tag and value. This regex matches any such leakage so we can drop it.
# Legitimate values ("saree", "kurta", ...) never contain angle-bracket tags, so
# this only ever fires on corrupted output.
_TOOL_MARKUP_LEAK = re.compile(r"</?\s*antml|</?\s*parameter\b|<\s*parameter\b", re.IGNORECASE)


def _clean_str(value: Any) -> str:
    """Coerce to a stripped string, blanking out any leaked tool-call markup.

    Guards against the Opus 4.8 quirk where an empty string field bleeds the
    model's internal tool-call tags into the value. Returns "" for such junk so
    no field ever propagates malformed markup to the contract.
    """
    s = str(value or "").strip()
    if not s:
        return ""
    if _TOOL_MARKUP_LEAK.search(s) or "&gt;" in s:
        return ""
    return s

# A generous ceiling — these outputs are tiny (a JSON object or 1-2 lines).
_MAX_TOKENS = 2048

# In-memory caches keyed by input hash. Process-lifetime; cleared on restart.
_extract_cache: dict[str, dict[str, Any]] = {}
_explain_cache: dict[str, str] = {}
_translate_cache: dict[str, dict[str, str]] = {}

# Lazily-constructed Anthropic client (None until first successful build).
_client: Any = None
_client_failed = False


def available() -> bool:
    return bool(settings.anthropic_api_key)


def _get_client() -> Any:
    """Build (once) and return the Anthropic client, or None if unavailable.

    Import of `anthropic` and client construction are deferred so the module
    imports cleanly even when the SDK or key is absent.
    """
    global _client, _client_failed
    if _client is not None:
        return _client
    if _client_failed or not available():
        return None
    try:
        import anthropic  # local import: enrichment is optional

        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return _client
    except Exception as exc:  # SDK missing / construction error -> no-op mode
        logger.warning("Anthropic client unavailable; enrichment disabled: %s", exc)
        _client_failed = True
        return None


def _hash(*parts: Any) -> str:
    blob = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _tool_input(response: Any, tool_name: str) -> dict[str, Any] | None:
    """Pull the input of the first matching tool_use block from a response."""
    for block in getattr(response, "content", []) or []:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == tool_name:
            data = getattr(block, "input", None)
            if isinstance(data, dict):
                return data
    return None


def _text(response: Any) -> str:
    """Concatenate text blocks from a response (ignores thinking/tool blocks)."""
    out: list[str] = []
    for block in getattr(response, "content", []) or []:
        if getattr(block, "type", None) == "text":
            out.append(getattr(block, "text", "") or "")
    return "".join(out).strip()


# --------------------------------------------------------------------------- #
# 1. extract_attributes                                                       #
# --------------------------------------------------------------------------- #
def extract_attributes(
    description: str | None,
    remarks: str | None = None,
    structured_gender: str | None = None,
    structured_age: str | None = None,
) -> dict[str, Any]:
    """Extract structured attributes from a messy/multilingual description.

    Returns the EXTRACT schema dict; on any failure returns a copy of
    EXTRACT_DEFAULT (never raises).
    """
    description = (description or "").strip()
    remarks = (remarks or "").strip()
    # Nothing to work with -> cheap default, no API call.
    if not description and not remarks:
        return dict(prompts.EXTRACT_DEFAULT)

    key = _hash("extract", description, remarks, structured_gender, structured_age)
    if key in _extract_cache:
        return dict(_extract_cache[key])

    client = _get_client()
    if client is None:
        return dict(prompts.EXTRACT_DEFAULT)

    # Volatile, per-record content goes AFTER the cached prefix (in the user turn).
    user_text = (
        "STRUCTURED FIELDS (from the registry form — may conflict with the text):\n"
        f"  gender: {structured_gender or 'unknown'}\n"
        f"  age: {structured_age or 'unknown'}\n\n"
        "FREE-TEXT DESCRIPTION:\n"
        f"  {description or '(none)'}\n\n"
        "ADDITIONAL REMARKS:\n"
        f"  {remarks or '(none)'}\n\n"
        "Call record_attributes once with your evidence-grounded reading."
    )

    try:
        response = client.messages.create(
            model=settings.claude_extract_model,
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            # Stable prefix: system prompt carries cache_control. Tools render
            # before system, so this marker caches the tool schema + system text.
            system=[
                {
                    "type": "text",
                    "text": prompts.EXTRACT_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[
                {
                    "name": prompts.EXTRACT_TOOL_NAME,
                    "description": prompts.EXTRACT_TOOL_DESCRIPTION,
                    "strict": True,
                    "input_schema": prompts.EXTRACT_INPUT_SCHEMA,
                }
            ],
            tool_choice={"type": "tool", "name": prompts.EXTRACT_TOOL_NAME},
            messages=[{"role": "user", "content": user_text}],
        )
    except Exception as exc:
        logger.warning("extract_attributes API error: %s", exc)
        return dict(prompts.EXTRACT_DEFAULT)

    data = _tool_input(response, prompts.EXTRACT_TOOL_NAME)
    if not data:
        # Refusal or no tool block -> safe default.
        return dict(prompts.EXTRACT_DEFAULT)

    result = _coerce_extract(data)
    _extract_cache[key] = result
    return dict(result)


def _coerce_extract(data: dict[str, Any]) -> dict[str, Any]:
    """Defensively shape the tool output to the contract (strict schema makes
    this near-redundant, but enrichment must never propagate a bad shape)."""
    out = dict(prompts.EXTRACT_DEFAULT)

    def _str_list(v: Any) -> list[str]:
        if isinstance(v, list):
            # _clean_str blanks leaked markup; the filter drops the empties.
            return [c for c in (_clean_str(x) for x in v) if c]
        return []

    out["clothing_colors"] = _str_list(data.get("clothing_colors"))
    out["marks"] = _str_list(data.get("marks"))
    out["mobility_confusion_flags"] = _str_list(data.get("mobility_confusion_flags"))
    out["clothing_type"] = _clean_str(data.get("clothing_type"))

    gender = str(data.get("apparent_gender") or "unknown").strip().lower()
    out["apparent_gender"] = gender if gender in ("male", "female", "unknown") else "unknown"

    quality = str(data.get("desc_quality") or "sparse").strip().lower()
    out["desc_quality"] = quality if quality in ("rich", "sparse", "contradictory") else "sparse"

    out["contradicts_structured"] = bool(data.get("contradicts_structured", False))
    return out


# --------------------------------------------------------------------------- #
# 2. explain_match                                                            #
# --------------------------------------------------------------------------- #
def explain_match(
    query: dict[str, Any],
    candidate: dict[str, Any],
    contributions: dict[str, float],
    score: float,
    language: str = "Hindi",
) -> str:
    """A faithful 1-2 line localized rationale pinned to the supplied evidence.

    The score is INPUT. Claude may never invent a number or a fact. On any
    failure returns "" (never raises).
    """
    language = (language or "Hindi").strip() or "Hindi"
    contributions = contributions or {}

    key = _hash("explain", query, candidate, contributions, score, language)
    if key in _explain_cache:
        return _explain_cache[key]

    client = _get_client()
    if client is None:
        return ""

    # Order contributions strongest-first so the model leads with what matters.
    try:
        ranked = sorted(
            ((str(k), float(v)) for k, v in contributions.items()),
            key=lambda kv: kv[1],
            reverse=True,
        )
    except Exception:
        ranked = [(str(k), v) for k, v in contributions.items()]

    evidence = {
        "score": score,
        "contributions_strongest_first": [{"feature": k, "contribution": v} for k, v in ranked],
        "query_record": _safe_fields(query),
        "candidate_record": _safe_fields(candidate),
        "target_language": language,
    }

    user_text = (
        "EVIDENCE (the ONLY facts you may use — the score is given, do not change "
        "or invent any number):\n"
        f"{json.dumps(evidence, ensure_ascii=False, indent=2)}\n\n"
        f"Write the 1-2 line rationale in {language} (native script). Output only "
        "the rationale."
    )

    try:
        response = client.messages.create(
            model=settings.claude_explain_model,
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": prompts.EXPLAIN_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_text}],
        )
    except Exception as exc:
        logger.warning("explain_match API error: %s", exc)
        return ""

    if getattr(response, "stop_reason", None) == "refusal":
        return ""

    text = _text(response)
    if text:
        _explain_cache[key] = text
    return text


def _safe_fields(record: dict[str, Any]) -> dict[str, Any]:
    """Drop obviously-sensitive raw fields (mobile, IDs) from records handed to
    the model — the rationale should narrate match features, not leak PII."""
    if not isinstance(record, dict):
        return {}
    drop = {"mobile", "phone", "mobile_number", "contact"}
    return {k: v for k, v in record.items() if k.lower() not in drop and v not in (None, "")}


# --------------------------------------------------------------------------- #
# 3. translate                                                                #
# --------------------------------------------------------------------------- #
def translate(strings: dict[str, str], target_language: str) -> dict[str, str]:
    """Batch-translate UI/voice-prompt strings, preserving keys.

    On any failure returns the input strings unchanged (never raises).
    """
    if not isinstance(strings, dict) or not strings:
        return dict(strings) if isinstance(strings, dict) else {}

    target_language = (target_language or "Hindi").strip() or "Hindi"
    # Stable cache key over the (keys+values) and language.
    key = _hash("translate", strings, target_language)
    if key in _translate_cache:
        return dict(_translate_cache[key])

    client = _get_client()
    if client is None:
        return dict(strings)

    keys = list(strings.keys())
    schema = prompts.build_translate_schema(keys)

    user_text = (
        f"Target language: {target_language}\n\n"
        "Translate the VALUES of this JSON object into the target language, "
        "keeping every key exactly. Return via record_translations.\n\n"
        f"{json.dumps(strings, ensure_ascii=False, indent=2)}"
    )

    try:
        response = client.messages.create(
            model=settings.claude_translate_model,
            max_tokens=_MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=[
                {
                    "type": "text",
                    "text": prompts.TRANSLATE_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[
                {
                    "name": prompts.TRANSLATE_TOOL_NAME,
                    "description": prompts.TRANSLATE_TOOL_DESCRIPTION,
                    "strict": True,
                    "input_schema": schema,
                }
            ],
            tool_choice={"type": "tool", "name": prompts.TRANSLATE_TOOL_NAME},
            messages=[{"role": "user", "content": user_text}],
        )
    except Exception as exc:
        logger.warning("translate API error: %s", exc)
        return dict(strings)

    data = _tool_input(response, prompts.TRANSLATE_TOOL_NAME)
    if not data:
        return dict(strings)

    # Preserve original keys; fall back to the source value for any key the model
    # dropped or returned empty, so the contract (same keys) always holds.
    out: dict[str, str] = {}
    for k in keys:
        v = data.get(k)
        out[k] = str(v) if isinstance(v, (str, int, float)) and str(v).strip() else strings[k]

    _translate_cache[key] = out
    return dict(out)
