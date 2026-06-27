"""Registry API: events (sync), cases, audit. PII masked by default."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query

from ..models import Event
from . import store

router = APIRouter(prefix="/registry", tags=["registry"])


def _is_supervisor(role: Optional[str]) -> bool:
    return (role or "").lower() == "supervisor"


@router.post("/events")
def post_events(events: list[Event]):
    """Idempotent bulk ingest — the sync endpoint the PWA outbox replays to."""
    applied = sum(1 for ev in events if store.append_event(ev))
    return {"received": len(events), "applied": applied}


@router.get("/cases")
def get_cases(
    case_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    x_role: Optional[str] = Header(default=None),
):
    reveal = _is_supervisor(x_role)
    docs = store.list_cases(case_type=case_type, status=status, limit=limit, offset=offset)
    return [store.mask_case(d, reveal_pii=reveal) for d in docs]


@router.get("/cases/{case_id}")
def get_case(case_id: str, x_role: Optional[str] = Header(default=None)):
    doc = store.get_case(case_id)
    if not doc:
        raise HTTPException(404, "case not found")
    return store.mask_case(doc, reveal_pii=_is_supervisor(x_role))


@router.get("/cases/{case_id}/audit")
def get_audit(case_id: str):
    """The event log IS the audit trail."""
    return store.get_audit_trail(case_id)


@router.get("/stats")
def stats():
    return {"total_cases": store.count_cases()}
