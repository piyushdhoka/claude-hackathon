"""Event store + case projection + PII masking.

This is the shared data layer every other module reads through. Keep it small
and dependency-free so the match/geo/enrich agents can rely on a stable contract.
"""
from __future__ import annotations

import json
from typing import Any, Iterable, Optional

from ..db import connect, row_to_doc
from ..models import Case, CaseType, Event

# --- Event types that mutate a case projection ---
EV_CREATED = "case.created"
EV_ATTR_UPDATED = "attribute.updated"
EV_STATUS = "status.changed"
EV_MATCH_CONFIRMED = "match.confirmed"
EV_MATCH_REJECTED = "match.rejected"
EV_DUP_FLAGGED = "dup.flagged"
EV_DUP_MERGED = "dup.merged"
EV_CONSENT = "consent.captured"
EV_PII_REVEALED = "pii.revealed"
EV_REUNITED = "case.reunited"
EV_PURGED = "case.purged"


# ----------------------------- writes -----------------------------------

def append_event(ev: Event) -> bool:
    """Append one event idempotently (no-op if event_id already seen).
    Returns True if newly applied. Folds the event into the case projection."""
    conn = connect()
    try:
        cur = conn.execute("SELECT 1 FROM events WHERE event_id=?", (ev.event_id,))
        if cur.fetchone():
            return False  # idempotent replay
        conn.execute(
            "INSERT INTO events(event_id,type,case_id,ts,device_id,actor,payload) "
            "VALUES(?,?,?,?,?,?,?)",
            (ev.event_id, ev.type, ev.case_id, ev.ts, ev.device_id, ev.actor,
             json.dumps(ev.payload, ensure_ascii=False)),
        )
        _fold(conn, ev)
        conn.commit()
        return True
    finally:
        conn.close()


def _fold(conn, ev: Event) -> None:
    """Apply an event to the cases projection."""
    if ev.type == EV_CREATED:
        case = Case(**ev.payload)
        _upsert_case(conn, case)
        return

    row = conn.execute("SELECT doc FROM cases WHERE case_id=?", (ev.case_id,)).fetchone()
    if not row:
        return
    doc = json.loads(row["doc"])

    if ev.type == EV_ATTR_UPDATED:
        doc.update(ev.payload or {})
    elif ev.type == EV_STATUS:
        doc["status"] = ev.payload.get("status", doc.get("status"))
    elif ev.type == EV_REUNITED:
        doc["status"] = "Reunited"
        if "resolution_hours" in ev.payload:
            doc["resolution_hours"] = ev.payload["resolution_hours"]
    elif ev.type == EV_DUP_FLAGGED:
        doc["is_duplicate_report"] = True
    elif ev.type == EV_CONSENT:
        doc["consent"] = bool(ev.payload.get("consent", True))
    elif ev.type == EV_PURGED:
        # privacy by design: drop PII + biometrics, keep anonymized shell
        for k in ("name", "mobile", "photo_ref", "face_embedding", "description"):
            doc[k] = None
        doc["purged"] = True
    _upsert_case(conn, Case(**doc))


def _upsert_case(conn, case: Case) -> None:
    conn.execute(
        "INSERT INTO cases(case_id,case_type,doc,gender,age_band,language,"
        "last_seen_location,lat,lng,zone_id,status,reported_at,updated_at) "
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,datetime('now')) "
        "ON CONFLICT(case_id) DO UPDATE SET case_type=excluded.case_type,doc=excluded.doc,"
        "gender=excluded.gender,age_band=excluded.age_band,language=excluded.language,"
        "last_seen_location=excluded.last_seen_location,lat=excluded.lat,lng=excluded.lng,"
        "zone_id=excluded.zone_id,status=excluded.status,reported_at=excluded.reported_at,"
        "updated_at=datetime('now')",
        (case.case_id, case.case_type.value if isinstance(case.case_type, CaseType) else case.case_type,
         case.model_dump_json(), case.gender, case.age_band, case.language,
         case.last_seen_location, case.lat, case.lng, case.zone_id,
         case.status.value if hasattr(case.status, "value") else case.status, case.reported_at),
    )


def upsert_case_direct(case: Case) -> None:
    """Seed helper: insert a case + emit its creation event in one shot."""
    from uuid import uuid4
    append_event(Event(
        event_id=str(uuid4()), type=EV_CREATED, case_id=case.case_id,
        ts=case.reported_at, actor="seed", payload=json.loads(case.model_dump_json()),
    ))


# ----------------------------- reads ------------------------------------

def get_case(case_id: str) -> Optional[dict[str, Any]]:
    conn = connect()
    try:
        row = conn.execute("SELECT doc FROM cases WHERE case_id=?", (case_id,)).fetchone()
        return row_to_doc(row) if row else None
    finally:
        conn.close()


def list_cases(
    case_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    conn = connect()
    try:
        q = "SELECT doc FROM cases WHERE 1=1"
        args: list[Any] = []
        if case_type:
            q += " AND case_type=?"; args.append(case_type)
        if status:
            q += " AND status=?"; args.append(status)
        q += " ORDER BY reported_at DESC LIMIT ? OFFSET ?"
        args += [limit, offset]
        return [json.loads(r["doc"]) for r in conn.execute(q, args).fetchall()]
    finally:
        conn.close()


def iter_cases(case_type: Optional[str] = None) -> Iterable[dict[str, Any]]:
    """Stream all cases for the match engine's blocking/scoring."""
    conn = connect()
    try:
        if case_type:
            rows = conn.execute("SELECT doc FROM cases WHERE case_type=?", (case_type,))
        else:
            rows = conn.execute("SELECT doc FROM cases")
        for r in rows:
            yield json.loads(r["doc"])
    finally:
        conn.close()


def count_cases() -> int:
    conn = connect()
    try:
        return conn.execute("SELECT COUNT(*) AS n FROM cases").fetchone()["n"]
    finally:
        conn.close()


def get_audit_trail(case_id: str) -> list[dict[str, Any]]:
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT event_id,type,ts,actor,device_id,payload FROM events "
            "WHERE case_id=? ORDER BY ts", (case_id,),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["payload"] = json.loads(d["payload"])
            out.append(d)
        return out
    finally:
        conn.close()


# ----------------------------- PII masking ------------------------------

def mask_mobile(mobile: Optional[str]) -> Optional[str]:
    if not mobile:
        return None
    digits = "".join(ch for ch in mobile if ch.isdigit())
    if len(digits) < 4:
        return "••••"
    return "+91 ••••••" + digits[-4:]


def mask_case(doc: dict[str, Any], reveal_pii: bool = False) -> dict[str, Any]:
    """Default API view masks contact PII and drops the raw embedding."""
    d = dict(doc)
    if not reveal_pii:
        d["mobile"] = mask_mobile(d.get("mobile"))
    d.pop("face_embedding", None)  # never ship the biometric vector to clients
    return d
