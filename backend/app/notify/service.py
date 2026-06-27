"""Notify-on-match orchestration.

Non-blocking enrichment: builds a localized message (Claude when reachable, else
the bundled template), sends it via the configured provider, and logs a
``pii.notified`` audit event. The operator-facing result never carries the raw
number — only a masked form.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from ..models import Event
from ..registry import store
from . import templates
from .provider import SmsProvider, get_provider


def _deliver(provider: SmsProvider, to: str, message: str, channel: str) -> None:
    """Send via the requested channel; IVR falls back to SMS if unsupported."""
    if channel == "ivr" and hasattr(provider, "call"):
        provider.call(to, message)  # type: ignore[attr-defined]
    else:
        provider.send(to, message)


def _build_message(case: dict[str, Any], center: str, code: str) -> str:
    """Localized notify text. Tries Claude (online); always safe-falls back to the
    bundled template so a missing key / dead network never blocks the send."""
    language = case.get("language") or "English"
    try:
        from ..enrich import claude  # optional, online-only
        msg = claude.localized_notify(language=language, center=center, code=code)
        if msg:
            return msg
    except Exception:
        pass  # enrichment is non-essential — deterministic template stands
    return templates.render(language, center, code)


def notify_match(
    missing_case: dict[str, Any],
    *,
    center: str,
    code: str,
    channel: str = "sms",
    provider: Optional[SmsProvider] = None,
) -> dict[str, Any]:
    """Notify the reporter that their missing person was found.

    Gated on consent + a reachable number. Returns a masked, operator-safe
    result. Logs ``pii.notified`` to the audit trail on success.
    """
    masked = store.mask_mobile(missing_case.get("mobile"))

    if not missing_case.get("consent"):
        return {"sent": False, "reason": "no_consent", "masked_to": masked}

    raw = (missing_case.get("mobile") or "").strip()
    if not raw:
        return {"sent": False, "reason": "no_mobile", "masked_to": masked}

    provider = provider or get_provider()
    language = missing_case.get("language") or "English"
    message = _build_message(missing_case, center, code)
    _deliver(provider, raw, message, channel)

    case_id = missing_case.get("case_id")
    if case_id:
        store.append_event(Event(
            event_id=str(uuid4()),
            type=store.EV_PII_NOTIFIED,
            case_id=case_id,
            ts=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            actor="system",
            payload={"channel": f"{provider.name}:{channel}", "masked_to": masked, "code": code},
        ))

    return {
        "sent": True,
        "channel": f"{provider.name}:{channel}",
        "masked_to": masked,
        "language": language,
        "message": message,
    }


def notify_direct(
    to: str,
    *,
    center: str,
    code: str,
    language: str = "English",
    channel: str = "sms",
    provider: Optional[SmsProvider] = None,
) -> dict[str, Any]:
    """Send a notify message to an explicit number (test/demo path).

    No case/consent lookup — the caller supplies the number directly. Useful for
    verifying real SMS/IVR delivery to a known phone. Returns a masked result.
    """
    raw = (to or "").strip()
    masked = store.mask_mobile(raw)
    if not raw:
        return {"sent": False, "reason": "no_number", "masked_to": masked}

    provider = provider or get_provider()
    message = templates.render(language, center, code)
    _deliver(provider, raw, message, channel)

    return {
        "sent": True,
        "channel": f"{provider.name}:{channel}",
        "masked_to": masked,
        "language": language,
        "message": message,
    }
