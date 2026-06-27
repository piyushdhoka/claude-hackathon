"""F2 — CCTV-assisted search corridor.

Turns the 4,079 cameras + chokepoint graph from a passive coverage map into an
active *where-to-look* worklist. Given a last-seen location, rank the nearby
cameras a control-room operator should review first, biased along the direction a
separated elder/child is likely to drift — toward the nearest egress node
(transfer node / parking). No footage exists in the dataset; this orders human
review, it does not analyse images.

Reuses :mod:`app.geo.service` (geocode, haversine, chokepoint graph) — no new
geo parsing.
"""
from __future__ import annotations

import math
from functools import lru_cache
from typing import Any, Optional

from . import service

# Where a disoriented pilgrim drifts toward: boarding/alighting points and the
# big parking corridors that pull foot traffic outward off the ghats.
EGRESS_CATEGORIES = {"transfer node", "parking belt", "outer parking", "parking"}

# Cameras whose perpendicular offset from the origin->egress line is within this
# band count as "on the corridor" and get a ranking boost.
_CORRIDOR_BAND_M = 250.0
# Proximity decay scale (metres): a camera ~600 m away scores ~1/e on proximity.
_PROXIMITY_SCALE_M = 600.0
_CORRIDOR_BONUS = 0.4

_M_PER_DEG_LAT = 111_320.0


def _to_local_m(lat: float, lng: float, olat: float, olng: float) -> tuple[float, float]:
    """Equirectangular projection of (lat,lng) to metres relative to an origin."""
    x = math.radians(lng - olng) * math.cos(math.radians(olat)) * 6_371_000.0
    y = math.radians(lat - olat) * 6_371_000.0
    return x, y


@lru_cache(maxsize=1)
def _cameras_with_id() -> list[dict[str, Any]]:
    """CCTV cameras as {camera_id, lat, lng} (the id the series-coded KML uses)."""
    fc = service._load_geojson("cameras.json")
    out: list[dict[str, Any]] = []
    for ft in fc["features"]:
        lng, lat = ft["geometry"]["coordinates"]
        out.append({"camera_id": ft["properties"]["name"], "lat": lat, "lng": lng})
    return out


@lru_cache(maxsize=1)
def egress_nodes() -> list[dict[str, Any]]:
    """Chokepoint nodes that act as exits (category normalised to lowercase)."""
    out: list[dict[str, Any]] = []
    for n in service._chokepoints():
        cat = (n.get("category") or "").strip().lower()
        if cat in EGRESS_CATEGORIES:
            out.append({"name": n["name"], "lat": n["lat"], "lng": n["lng"], "category": cat})
    return out


def _nearest_egress(lat: float, lng: float) -> Optional[dict[str, Any]]:
    best, best_d = None, float("inf")
    for node in egress_nodes():
        d = service.haversine_m(lat, lng, node["lat"], node["lng"])
        if d < best_d:
            best, best_d = node, d
    return best


def search_corridor(
    last_seen_location: str,
    *,
    radius_m: float = 1500.0,
    top_k: int = 15,
) -> Optional[dict[str, Any]]:
    """Rank cameras to review near ``last_seen_location``.

    Returns ``{origin, drift_target, cameras:[...]}`` or ``None`` if the location
    cannot be geocoded. Each camera carries ``distance_m``, an ``on_corridor``
    flag and a composite ``score`` (proximity + drift-corridor bonus).
    """
    geo = service.geocode(last_seen_location)
    if geo is None:
        return None
    olat, olng, zone_id = geo

    drift = _nearest_egress(olat, olng)
    dx = dy = 0.0
    dlen = 0.0
    if drift is not None:
        dx, dy = _to_local_m(drift["lat"], drift["lng"], olat, olng)
        dlen = math.hypot(dx, dy)

    cams: list[dict[str, Any]] = []
    for cam in _cameras_with_id():
        d_seen = service.haversine_m(olat, olng, cam["lat"], cam["lng"])
        if d_seen > radius_m:
            continue

        on_corridor = False
        if dlen > 0:
            cx, cy = _to_local_m(cam["lat"], cam["lng"], olat, olng)
            proj = (cx * dx + cy * dy) / dlen          # signed distance along drift axis
            perp = abs(cx * dy - cy * dx) / dlen        # perpendicular offset from axis
            on_corridor = -50.0 <= proj <= dlen * 1.2 and perp <= _CORRIDOR_BAND_M

        score = math.exp(-d_seen / _PROXIMITY_SCALE_M)
        if on_corridor:
            score += _CORRIDOR_BONUS

        cams.append({
            "camera_id": cam["camera_id"],
            "lat": round(cam["lat"], 6),
            "lng": round(cam["lng"], 6),
            "distance_m": round(d_seen, 1),
            "on_corridor": on_corridor,
            "score": round(score, 4),
        })

    cams.sort(key=lambda c: (-c["score"], c["distance_m"], c["camera_id"]))
    return {
        "origin": {"lat": olat, "lng": olng, "zone_id": zone_id,
                   "last_seen_location": last_seen_location},
        "drift_target": drift,
        "cameras": cams[:top_k],
    }
