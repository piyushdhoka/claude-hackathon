"""Triage scoring service.

Operates on plain Case dicts (as returned by :mod:`app.registry.store`). Pure
functions, no I/O — the API/router layer supplies the open cases and the resolved
history.
"""
from __future__ import annotations

# Age vulnerability: unaccompanied children and the very old are highest risk.
_AGE_WEIGHT = {
    "0-12": 1.0,
    "13-17": 0.7,
    "18-40": 0.2,
    "41-60": 0.3,
    "61-70": 0.5,
    "71-80": 0.6,
    "80+": 1.0,
}

# Statuses indicating the person is in custody/care and the case is unresolved —
# these are the highest-urgency open cases.
_HOSPITAL_STATUS = "Transferred to hospital"


def _report_hour(reported_at: str) -> int | None:
    # Format: "YYYY-MM-DD HH:MM"
    try:
        return int(reported_at.split(" ")[1].split(":")[0])
    except (AttributeError, IndexError, ValueError):
        return None


def vulnerability_score(case: dict) -> float:
    """0..1 vulnerability of a case. Higher = handle sooner.

    Additive signals over an age baseline: hospital transfer, no reachable
    contact, and night-hours report (harder to resolve, person more exposed).
    """
    score = _AGE_WEIGHT.get(case.get("age_band", ""), 0.2)

    if case.get("status") == _HOSPITAL_STATUS:
        score += 0.3
    if not (case.get("mobile") or "").strip():
        score += 0.2

    hour = _report_hour(case.get("reported_at", ""))
    if hour is not None and (hour < 6 or hour >= 22):
        score += 0.2

    return min(score, 1.0)


def _median(values: list[float]) -> float | None:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    mid = len(vals) // 2
    if len(vals) % 2:
        return vals[mid]
    return (vals[mid - 1] + vals[mid]) / 2


def predict_eta_hours(case: dict, history: list[dict]) -> float | None:
    """Predicted hours-to-reunion: median ``resolution_hours`` for the same age
    band, falling back to the overall median when that band has no history."""
    band = case.get("age_band")
    band_hours = [
        h.get("resolution_hours")
        for h in history
        if h.get("age_band") == band and h.get("resolution_hours") is not None
    ]
    eta = _median(band_hours)
    if eta is not None:
        return eta
    return _median([h.get("resolution_hours") for h in history])


def build_priority_queue(
    open_cases: list[dict],
    history: list[dict],
    sla_hours: float = 6.0,
) -> list[dict]:
    """Open cases sorted by vulnerability desc, each annotated with eta + sla flag.

    ``sla_breach`` marks cases whose predicted reunion time already exceeds the
    service-level target, so supervisors can escalate before the clock runs out.
    """
    annotated = []
    for case in open_cases:
        eta = predict_eta_hours(case, history)
        annotated.append(
            {
                **case,
                "vulnerability": vulnerability_score(case),
                "eta_hours": eta,
                "sla_breach": eta is not None and eta > sla_hours,
            }
        )
    annotated.sort(key=lambda c: c["vulnerability"], reverse=True)
    return annotated
