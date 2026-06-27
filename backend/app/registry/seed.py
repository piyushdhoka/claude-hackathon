"""Seed the registry from Synthetic_Missing_Persons_2500.csv.

All CSV rows are `missing` reports. Found cases are created live via the wizard
during the demo — matching a found person against these missing reports is the
hero flow. Geocoding of last_seen_location is filled in later by the geo module
(stored as lat/lng/zone_id once geo.service is available); seed leaves them null.
"""
from __future__ import annotations

import csv

from ..config import settings
from ..db import init_db
from ..models import Attributes, Case, CaseStatus, CaseType
from .store import count_cases, upsert_case_direct


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


def _status(raw: str | None) -> CaseStatus:
    raw = (raw or "").strip().lower()
    mapping = {
        "reunited": CaseStatus.reunited,
        "pending": CaseStatus.pending,
        "transferred to hospital": CaseStatus.transferred_hospital,
        "unresolved": CaseStatus.unresolved,
    }
    return mapping.get(raw, CaseStatus.pending)


def seed(force: bool = False) -> int:
    init_db()
    if count_cases() > 0 and not force:
        return count_cases()

    path = settings.missing_persons_csv
    n = 0
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            res = _clean(row.get("resolution_hours"))
            case = Case(
                case_id=row["case_id"].strip(),
                case_type=CaseType.missing,
                reported_at=_clean(row.get("reported_at")) or "",
                reporting_center=_clean(row.get("reporting_center")) or "Unknown",
                name=_clean(row.get("missing_person_name")),
                gender=_clean(row.get("gender")) or "Unknown",
                age_band=_clean(row.get("age_band")) or "Unknown",
                state=_clean(row.get("state")),
                district=_clean(row.get("district")),
                language=_clean(row.get("language")),
                mobile=_clean(row.get("reporter_mobile")),
                last_seen_location=_clean(row.get("last_seen_location")),
                description=_clean(row.get("physical_description")),
                attributes=Attributes(),
                status=_status(row.get("status")),
                resolution_hours=float(res) if res else None,
                is_duplicate_report=str(row.get("is_duplicate_report", "")).strip().lower() == "true",
                remarks=_clean(row.get("remarks")),
                consent=True,  # synthetic records assumed consented for the demo
                created_by="seed",
            )
            upsert_case_direct(case)
            n += 1
    return n


if __name__ == "__main__":
    total = seed(force=True)
    print(f"Seeded {total} cases into the registry.")
