"""Deterministic claim-fraud assessment + audit logging."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from ..models import Event
from ..registry import store

MINOR_BANDS = {"0-12", "13-17"}

# Per-flag risk weights; summed and clamped to 1.0.
_FLAG_WEIGHT = {
    "multiple_minor_claims": 0.6,
    "answer_mismatch": 0.5,
    "repeat_rejected": 0.4,
}
_BLOCK_THRESHOLD = 0.6
_REVIEW_THRESHOLD = 0.3


def _is_minor(case: dict[str, Any]) -> bool:
    return case.get("age_band") in MINOR_BANDS


def _answer_mismatches(answers: dict[str, Any], case: dict[str, Any]) -> tuple[int, int]:
    """(mismatches, checked) comparing the claimant's answers to case truth."""
    attrs = case.get("attributes") or {}
    mismatches = checked = 0
    for key, val in (answers or {}).items():
        if key == "clothing_color":
            colors = [c.lower() for c in attrs.get("clothing_colors", [])]
            if colors:
                checked += 1
                if str(val).lower() not in colors:
                    mismatches += 1
        elif key in case and case[key] is not None:
            checked += 1
            if str(val).lower() != str(case[key]).lower():
                mismatches += 1
    return mismatches, checked


def _detect_flags(claim: dict[str, Any], case: dict[str, Any],
                  history: list[dict[str, Any]]) -> list[str]:
    flags: list[str] = []
    claimant = claim.get("claimant_id")

    # 1. one claimant linked to multiple minor cases
    minor_cases = {
        h["case_id"] for h in history
        if h.get("claimant_id") == claimant and h.get("age_band") in MINOR_BANDS
    }
    if _is_minor(case):
        minor_cases.add(case.get("case_id"))
    if len(minor_cases) >= 2:
        flags.append("multiple_minor_claims")

    # 2. answers contradict the case
    mismatches, checked = _answer_mismatches(claim.get("answers", {}), case)
    if checked and mismatches / checked >= 0.5:
        flags.append("answer_mismatch")

    # 3. claimant has a history of rejected claims
    rejected = sum(
        1 for h in history
        if h.get("claimant_id") == claimant and h.get("status") == "rejected"
    )
    if rejected >= 2:
        flags.append("repeat_rejected")

    return flags


def assess_claim(
    claim: dict[str, Any],
    case: dict[str, Any],
    *,
    history: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Score a claim. Returns band (clear/review/block), flags, and the gating
    decisions (auto-reveal allowed? supervisor needed? guardian consent?)."""
    history = history or []
    flags = _detect_flags(claim, case, history)
    risk = min(sum(_FLAG_WEIGHT.get(f, 0.0) for f in flags), 1.0)

    if risk >= _BLOCK_THRESHOLD:
        band = "block"
    elif risk >= _REVIEW_THRESHOLD:
        band = "review"
    else:
        band = "clear"

    requires_guardian_consent = _is_minor(case)
    requires_supervisor = band != "clear" or requires_guardian_consent
    allow_auto_reveal = band == "clear" and not requires_guardian_consent

    return {
        "claim_id": claim.get("claim_id"),
        "case_id": case.get("case_id"),
        "risk": round(risk, 3),
        "band": band,
        "flags": flags,
        "requires_guardian_consent": requires_guardian_consent,
        "requires_supervisor": requires_supervisor,
        "allow_auto_reveal": allow_auto_reveal,
    }


def process_claim(
    claim: dict[str, Any],
    case: dict[str, Any],
    *,
    history: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Assess a claim and write the decision to the audit trail."""
    verdict = assess_claim(claim, case, history=history)
    case_id = case.get("case_id")
    if case_id:
        ev_type = store.EV_CLAIM_CLEARED if verdict["band"] == "clear" else store.EV_CLAIM_FLAGGED
        store.append_event(Event(
            event_id=str(uuid4()),
            type=ev_type,
            case_id=case_id,
            ts=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            actor="system",
            payload={
                "claim_id": claim.get("claim_id"),
                "claimant_id": claim.get("claimant_id"),
                "band": verdict["band"],
                "flags": verdict["flags"],
            },
        ))
    return verdict
