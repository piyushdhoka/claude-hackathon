"""F5 — Reunion handoff routing.

After a match is confirmed, route the family to the nearest help point — a police
station (authoritative KML coords) or a help center (geocoded reporting_center) —
with distance and a compass heading. Offline-friendly: nearest-node + bearing,
no external routing API.

Reuses :mod:`app.geo.service` (geocode, haversine, coverage anchors).
"""
from __future__ import annotations

import math
from typing import Any, Optional

from . import service

_COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Initial great-circle bearing from point 1 to point 2, degrees [0,360)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _heading(deg: float) -> str:
    return _COMPASS[round(deg / 45.0) % 8]


def handoff_route(location: str, *, k: int = 3) -> Optional[dict[str, Any]]:
    """Nearest help points to ``location``.

    Returns ``{origin, destination, options}`` (destination = closest anchor;
    options = the k nearest, ascending) or ``None`` if the location cannot be
    geocoded.
    """
    geo = service.geocode(location)
    if geo is None:
        return None
    olat, olng, zone_id = geo

    ranked: list[dict[str, Any]] = []
    for a in service._coverage_anchors():
        dist = service.haversine_m(olat, olng, a["lat"], a["lng"])
        bearing = _bearing_deg(olat, olng, a["lat"], a["lng"])
        ranked.append({
            "name": a["name"],
            "kind": a.get("kind", "center"),
            "lat": a["lat"],
            "lng": a["lng"],
            "distance_m": round(dist, 1),
            "bearing_deg": round(bearing, 1),
            "heading": _heading(bearing),
            "_d": dist,  # raw distance for stable ordering (display value is rounded)
        })
    if not ranked:
        return None

    # Stable sort by raw distance: ties keep anchor input order (matches a plain
    # nearest-anchor min over the same list).
    ranked.sort(key=lambda r: r["_d"])
    for r in ranked:
        del r["_d"]
    return {
        "origin": {"lat": olat, "lng": olng, "zone_id": zone_id, "location": location},
        "destination": ranked[0],
        "options": ranked[:k],
    }
