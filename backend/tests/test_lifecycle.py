"""Registry lifecycle + PII governance tests.

Covers the responsible-data path the supervisor UI drives: create -> reunite
(status flips) -> purge (PII dropped) -> masking + audit trail.
"""
from __future__ import annotations

import uuid

from app.models import Case, CaseType, Event
from app.registry import store


def _mk(case_id: str, **over) -> Case:
    base = dict(
        case_id=case_id, case_type=CaseType.found, reported_at="2027-08-01 10:00",
        reporting_center="Ramkund Kho-Ya-Paya Kendra", name="Test Person",
        gender="Female", age_band="71-80", language="Hindi",
        mobile="+91 9876543210", last_seen_location="Ramkund Ghat", consent=True,
    )
    base.update(over)
    return Case(**base)


def _ev(t: str, cid: str, payload=None) -> Event:
    return Event(event_id=str(uuid.uuid4()), type=t, case_id=cid,
                 ts="2027-08-01 12:00", actor="test", payload=payload or {})


def test_mask_mobile_hides_digits():
    masked = store.mask_mobile("+91 9876543210")
    assert masked is not None and masked.endswith("3210") and "9876" not in masked


def test_create_reunite_purge_lifecycle():
    cid = "TEST-LIFE-1"
    store.append_event(_ev(store.EV_CREATED, cid,
                           __import__("json").loads(_mk(cid).model_dump_json())))
    doc = store.get_case(cid)
    assert doc and doc["status"] == "Pending"

    # reunite -> status flips
    store.append_event(_ev(store.EV_REUNITED, cid, {"matched_id": "OTHER"}))
    assert store.get_case(cid)["status"] == "Reunited"

    # default API view masks the mobile; supervisor view reveals it
    assert store.mask_case(store.get_case(cid))["mobile"] != "+91 9876543210"
    assert store.mask_case(store.get_case(cid), reveal_pii=True)["mobile"] == "+91 9876543210"

    # purge -> PII dropped from the projection
    store.append_event(_ev(store.EV_PURGED, cid))
    purged = store.get_case(cid)
    assert purged["purged"] is True
    assert purged["name"] is None and purged["mobile"] is None and purged["description"] is None

    # audit trail retains every step (the event log is the audit trail)
    types = [e["type"] for e in store.get_audit_trail(cid)]
    assert store.EV_CREATED in types and store.EV_REUNITED in types and store.EV_PURGED in types


def test_idempotent_event_replay():
    cid = "TEST-IDEMP-1"
    ev = _ev(store.EV_CREATED, cid, __import__("json").loads(_mk(cid).model_dump_json()))
    assert store.append_event(ev) is True
    assert store.append_event(ev) is False  # same event_id -> no-op
