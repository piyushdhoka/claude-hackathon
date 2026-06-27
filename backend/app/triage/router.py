"""F3 Triage API. /triage/queue — vulnerability-ranked open cases with ETA."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, Query

from ..registry import store
from . import service

router = APIRouter(prefix="/triage", tags=["triage"])

# Open (unresolved) statuses that belong in the operator work queue.
_OPEN_STATUSES = ("Pending", "Transferred to hospital", "Unresolved", "Matched")


def _is_supervisor(role: Optional[str]) -> bool:
    return (role or "").lower() == "supervisor"


@router.get("/queue")
def queue(
    sla_hours: float = Query(6.0, gt=0),
    limit: int = Query(200, le=2000),
    x_role: Optional[str] = Header(default=None),
):
    """Open cases ranked by vulnerability, each annotated with a predicted
    reunion ETA and an SLA-breach flag. PII masked unless the caller is a
    supervisor."""
    history = [
        h for h in store.list_cases(status="Reunited", limit=5000)
        if h.get("resolution_hours") is not None
    ]
    open_cases: list[dict] = []
    for st in _OPEN_STATUSES:
        open_cases += store.list_cases(status=st, limit=limit)

    ranked = service.build_priority_queue(open_cases, history, sla_hours=sla_hours)[:limit]
    reveal = _is_supervisor(x_role)
    return [store.mask_case(c, reveal_pii=reveal) for c in ranked]
