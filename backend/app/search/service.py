"""Family self-search: assemble a partial query and run it against found cases."""
from __future__ import annotations

from typing import Any, Iterable, Optional

from ..geo import service as geo
from ..match import engine

# Top-level case fields the family wizard can supply.
_TOP_FIELDS = ("gender", "age_band", "language", "state", "district",
               "name", "reported_at", "description")
# Tap fields that belong in the nested attributes block the engine compares.
_ATTR_FIELDS = ("clothing_colors", "clothing_type", "marks",
                "mobility_confusion_flags", "build", "hair", "headwear",
                "footwear", "accessories", "complexion")


def build_family_query(payload: dict[str, Any]) -> dict[str, Any]:
    """Turn family wizard taps into a match-engine query.

    Geocodes ``last_seen_location`` to lat/lng/zone so the geo feature fires, and
    routes clothing/marks taps into the ``attributes`` block. Identity fields
    (name/mobile) are optional — available-case normalization carries a sparse
    query on geo+age+gender+language.
    """
    query: dict[str, Any] = {k: payload[k] for k in _TOP_FIELDS if payload.get(k) is not None}

    loc = payload.get("last_seen_location")
    if loc:
        query["last_seen_location"] = loc
        geocoded = geo.geocode(loc)
        if geocoded is not None:
            query["lat"], query["lng"], query["zone_id"] = geocoded

    query["attributes"] = {k: payload[k] for k in _ATTR_FIELDS if payload.get(k) is not None}
    return query


def search_family(
    payload: dict[str, Any],
    *,
    top_k: int = 5,
    pool: Optional[Iterable[dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """Rank found-person candidates for a family's description.

    Candidates are masked by the engine (contact PII hidden, no biometrics).
    """
    query = build_family_query(payload)
    cands = engine.find_matches(query, case_type="found", top_k=top_k, pool=pool)
    return [c.model_dump() for c in cands]
