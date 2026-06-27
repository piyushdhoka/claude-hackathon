"""Core data model. One entity — a Case — with case_type in {missing, found}.

Matching a missing report to a found person is matching across case_type.
Duplicate detection is matching within the same case_type across centers.
One model, three jobs.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class CaseType(str, Enum):
    missing = "missing"
    found = "found"


class CaseStatus(str, Enum):
    pending = "Pending"
    matched = "Matched"
    reunited = "Reunited"
    transferred_hospital = "Transferred to hospital"
    unresolved = "Unresolved"
    duplicate = "Duplicate"


class Attributes(BaseModel):
    """Structured, comparable attributes. Populated by the wizard taps, Claude
    extraction from the free-text description, and/or Claude VISION analysis of a
    captured photo. Visual fields are the strongest signal for nameless cases."""
    clothing_colors: list[str] = Field(default_factory=list)
    clothing_type: Optional[str] = None
    marks: list[str] = Field(default_factory=list)  # rudraksha, tilak, spectacles, walking stick...
    mobility_confusion_flags: list[str] = Field(default_factory=list)  # memory_loss, hard_of_hearing...
    apparent_gender: Optional[str] = None  # derived from description/photo; may contradict `gender`
    apparent_age_band: Optional[str] = None
    desc_quality: Optional[str] = None     # rich | sparse | contradictory
    contradicts_structured: bool = False   # description disagrees with structured gender/age

    # --- Visual features (from Claude vision analysis of a photo) ---
    build: Optional[str] = None            # slim / heavy / average / frail
    hair: Optional[str] = None             # grey / bald / black / braided ...
    complexion: Optional[str] = None
    headwear: Optional[str] = None         # turban / cap / scarf / pallu ...
    footwear: Optional[str] = None
    accessories: list[str] = Field(default_factory=list)  # bag, stick, glasses, jewellery...
    visual_quality: Optional[str] = None   # good | partial | poor (face/photo usability)
    source: Optional[str] = None           # taps | description | vision | mixed


class Case(BaseModel):
    case_id: str
    case_type: CaseType = CaseType.missing
    reported_at: str  # ISO-ish "YYYY-MM-DD HH:MM"
    reporting_center: str

    # Identity (often incomplete: ~15% no name, ~20% no mobile)
    name: Optional[str] = None
    gender: str = "Unknown"
    age_band: str = "Unknown"
    state: Optional[str] = None
    district: Optional[str] = None
    language: Optional[str] = None
    mobile: Optional[str] = None  # PII — masked in API responses unless authorized

    # Location
    last_seen_location: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    zone_id: Optional[str] = None

    # Description + structured attributes
    description: Optional[str] = None
    visual_description: Optional[str] = None  # Claude-vision natural-language, localized
    attributes: Attributes = Field(default_factory=Attributes)

    # Biometric (face) — embedding only, never raw image in the matchable store
    photo_ref: Optional[str] = None
    face_embedding: Optional[list[float]] = None

    # Lifecycle
    status: CaseStatus = CaseStatus.pending
    resolution_hours: Optional[float] = None
    is_duplicate_report: bool = False
    remarks: Optional[str] = None

    # Governance
    consent: bool = False
    created_by: Optional[str] = None
    purged: bool = False


class Event(BaseModel):
    """Append-only event. The event log IS the audit trail and the sync unit."""
    event_id: str               # client-generated UUID (idempotent replay)
    type: str                   # case.created | attribute.updated | match.confirmed | ...
    case_id: str
    ts: str
    device_id: Optional[str] = None
    actor: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class MatchCandidate(BaseModel):
    case_id: str
    score: float                # 0..100
    contributions: dict[str, float] = Field(default_factory=dict)  # per-feature explainability
    rationale: Optional[str] = None  # Claude-generated, localized (online only)
    case: Optional[dict[str, Any]] = None  # masked candidate snapshot for display
