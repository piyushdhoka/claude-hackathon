"""SQLite access. Append-only `events` table projected into a `cases` table.

The event log is the source of truth and the audit trail; `cases` is a
materialized view rebuilt by folding events.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from .config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    event_id   TEXT PRIMARY KEY,          -- client UUID; idempotent replay
    type       TEXT NOT NULL,
    case_id    TEXT NOT NULL,
    ts         TEXT NOT NULL,
    device_id  TEXT,
    actor      TEXT,
    payload    TEXT NOT NULL DEFAULT '{}',
    received_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

CREATE TABLE IF NOT EXISTS cases (
    case_id    TEXT PRIMARY KEY,
    case_type  TEXT NOT NULL DEFAULT 'missing',
    doc        TEXT NOT NULL,             -- full Case as JSON
    -- denormalized columns for fast blocking / filtering
    gender     TEXT,
    age_band   TEXT,
    language   TEXT,
    last_seen_location TEXT,
    lat        REAL,
    lng        REAL,
    zone_id    TEXT,
    status     TEXT,
    reported_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cases_block ON cases(case_type, gender, age_band);
CREATE INDEX IF NOT EXISTS idx_cases_loc ON cases(last_seen_location);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()


def row_to_doc(row: sqlite3.Row) -> dict[str, Any]:
    return json.loads(row["doc"])
