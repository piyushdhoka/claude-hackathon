"""Geography service — geocoding, separation-risk hotspots and kiosk siting.

Public contract (consumed by ``app.geo.router``):

    geocode(last_seen_location: str) -> (lat, lng, zone_id) | None
    hotspots() -> list[dict]               # ranked separation-risk nodes
    kiosk_recommendations() -> list[dict]  # high risk INTERSECT low coverage
    build_geojson() -> dict                # rebuild + write frontend/public/geo/*.json

Design
------
* **geocode** resolves the 20-value ``last_seen_location`` vocabulary to real
  coordinates via ``shared/location_coords.json`` (the curated map), then assigns
  a ``zone_id`` with a shapely point-in-polygon test against the 32 KML zone
  polygons. Free-text input that is not one of the 20 canonical values is
  resolved with a fuzzy (rapidfuzz) match against the canonical names, the KML
  landmarks and the chokepoints, so the geo router's ``/geocode`` endpoint is
  useful for arbitrary strings too.

* **hotspots** scores every candidate node (chokepoints + transfer nodes +
  landmarks) by ``report_density * category_weight``: report_density counts
  registry cases whose ``last_seen_location`` geocodes within ~450 m of the
  node; category_weight lifts transfer nodes, no-vehicle pressure zones and
  ghats (the places elders actually get separated). Scores are normalised 0..1.

* **kiosk_recommendations** intersects high separation risk with low coverage.
  coverage = distance to the nearest help center / police station, discounted by
  the local CCTV density. Recommends nodes that are high-risk AND poorly covered,
  each with a short human-readable ``why``.

The KML parsing / GeoJSON emission itself lives in :mod:`app.geo.etl`; this
module reads the already-emitted GeoJSON (``settings.geojson_out``) so it does
not depend on the KML source paths at request time, and only calls back into the
ETL for :func:`build_geojson`.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from ..config import REPO_ROOT, settings

# location_coords.json lives in the repo-root ``shared/`` contract directory.
LOCATION_COORDS_PATH: Path = REPO_ROOT / "shared" / "location_coords.json"

# ---------------------------------------------------------------------------
# Geospatial helpers
# ---------------------------------------------------------------------------
_EARTH_R_M = 6_371_000.0  # mean earth radius, metres


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two WGS84 points, in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_R_M * math.asin(min(1.0, math.sqrt(a)))


# Radius (metres) within which a registry case "belongs" to a node for density.
DENSITY_RADIUS_M = 450.0
# Radius (metres) for counting CCTV coverage around a node.
CCTV_RADIUS_M = 500.0


# ---------------------------------------------------------------------------
# GeoJSON / contract loaders (parsed once per process)
# ---------------------------------------------------------------------------
def _load_geojson(name: str) -> dict[str, Any]:
    path = settings.geojson_out / name
    if not path.exists():
        # GeoJSON not yet emitted -> build it from the KMLs on demand.
        build_geojson()
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _location_coords() -> dict[str, dict[str, Any]]:
    """The curated last_seen_location -> {lat,lng,...} map."""
    return json.loads(LOCATION_COORDS_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _zones() -> list[dict[str, Any]]:
    """Each zone as {zone_id, ring:[(lng,lat)...], polygon: shapely.Polygon}."""
    from shapely.geometry import Polygon

    out: list[dict[str, Any]] = []
    for ft in _load_geojson("zones.json")["features"]:
        rings = ft["geometry"]["coordinates"]
        if not rings:
            continue
        outer = [(x, y) for x, y in rings[0]]
        if len(outer) < 3:
            continue
        out.append({
            "zone_id": ft["properties"]["zone_id"],
            "centroid": ft["properties"].get("centroid"),
            "polygon": Polygon(outer),
        })
    return out


@lru_cache(maxsize=1)
def _cameras() -> list[tuple[float, float]]:
    """CCTV camera positions as (lat, lng)."""
    return [
        (ft["geometry"]["coordinates"][1], ft["geometry"]["coordinates"][0])
        for ft in _load_geojson("cameras.json")["features"]
    ]


@lru_cache(maxsize=1)
def _landmarks() -> list[dict[str, Any]]:
    return [
        {"name": ft["properties"]["name"],
         "lat": ft["geometry"]["coordinates"][1],
         "lng": ft["geometry"]["coordinates"][0],
         "category": ft["properties"].get("category"),
         "kind": "landmark"}
        for ft in _load_geojson("landmarks.json")["features"]
    ]


@lru_cache(maxsize=1)
def _chokepoints() -> list[dict[str, Any]]:
    return [
        {"name": ft["properties"]["name"],
         "lat": ft["geometry"]["coordinates"][1],
         "lng": ft["geometry"]["coordinates"][0],
         "category": ft["properties"].get("category"),
         "risk": ft["properties"].get("risk"),
         "note": ft["properties"].get("note"),
         "kind": "chokepoint"}
        for ft in _load_geojson("chokepoints.json")["features"]
    ]


@lru_cache(maxsize=1)
def _police() -> list[dict[str, Any]]:
    return [
        {"name": ft["properties"]["name"],
         "lat": ft["geometry"]["coordinates"][1],
         "lng": ft["geometry"]["coordinates"][0]}
        for ft in _load_geojson("police.json")["features"]
    ]


# ---------------------------------------------------------------------------
# geocode
# ---------------------------------------------------------------------------
def _zone_for(lat: float, lng: float) -> Optional[str]:
    """Point-in-polygon zone assignment via shapely; nearest centroid fallback."""
    from shapely.geometry import Point

    pt = Point(lng, lat)
    for z in _zones():
        if z["polygon"].contains(pt) or z["polygon"].touches(pt):
            return z["zone_id"]
    # Not strictly inside any zone (nodes can sit on the boundary / just outside).
    # Fall back to the nearest zone centroid so every located point gets a zone.
    best, best_d = None, float("inf")
    for z in _zones():
        c = z.get("centroid")
        if not c:
            continue
        d = haversine_m(lat, lng, c[1], c[0])
        if d < best_d:
            best, best_d = z["zone_id"], d
    return best


def _fuzzy_resolve(text: str) -> Optional[tuple[float, float]]:
    """Resolve arbitrary free text to coords via the location map + KML names."""
    from rapidfuzz import fuzz, process

    candidates: list[tuple[str, float, float]] = []
    for name, v in _location_coords().items():
        candidates.append((name, v["lat"], v["lng"]))
    for n in _landmarks() + _chokepoints():
        candidates.append((n["name"], n["lat"], n["lng"]))

    names = [c[0] for c in candidates]
    match = process.extractOne(text, names, scorer=fuzz.token_set_ratio)
    if match is None or match[1] < 60:
        return None
    _, _, idx = match
    return candidates[idx][1], candidates[idx][2]


def geocode(last_seen_location: str) -> Optional[tuple[float, float, Optional[str]]]:
    """Resolve a ``last_seen_location`` string to ``(lat, lng, zone_id)``.

    Exact match against the curated 20-value map first; otherwise a fuzzy match
    against the map + KML landmarks/chokepoints. Returns ``None`` if nothing
    plausible matches.
    """
    if not last_seen_location:
        return None
    key = last_seen_location.strip()
    rec = _location_coords().get(key)
    if rec is not None:
        lat, lng = float(rec["lat"]), float(rec["lng"])
    else:
        resolved = _fuzzy_resolve(key)
        if resolved is None:
            return None
        lat, lng = resolved
    return lat, lng, _zone_for(lat, lng)


# ---------------------------------------------------------------------------
# Registry-driven report density
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def _case_points() -> list[tuple[float, float]]:
    """All registry cases' last-seen coordinates as (lat, lng).

    Prefers the canonical ``location_coords`` mapping for the 20-value
    ``last_seen_location`` vocabulary (so density reflects any geocoding
    improvements made here, even though the case rows in the read-only DB were
    backfilled from older coordinates); falls back to the case's own lat/lng.
    """
    from ..registry import store

    pts: list[tuple[float, float]] = []
    coords = _location_coords()
    for case in store.iter_cases():
        loc = case.get("last_seen_location")
        rec = coords.get(loc) if loc else None
        if rec is not None:
            pts.append((float(rec["lat"]), float(rec["lng"])))
            continue
        lat, lng = case.get("lat"), case.get("lng")
        if lat is not None and lng is not None:
            pts.append((float(lat), float(lng)))
    return pts


def _reports_near(lat: float, lng: float, radius_m: float = DENSITY_RADIUS_M) -> int:
    return sum(
        1 for clat, clng in _case_points()
        if haversine_m(lat, lng, clat, clng) <= radius_m
    )


def _cctv_near(lat: float, lng: float, radius_m: float = CCTV_RADIUS_M) -> int:
    return sum(
        1 for clat, clng in _cameras()
        if haversine_m(lat, lng, clat, clng) <= radius_m
    )


# ---------------------------------------------------------------------------
# Node category weighting
# ---------------------------------------------------------------------------
# Where elders actually get separated: transfer nodes (boarding/alighting),
# no-vehicle pressure zones (forced foot crowds) and ghats (snan crush) rank
# higher than ordinary traffic choke points or parking.
_CATEGORY_WEIGHT: dict[str, float] = {
    "transfer node": 1.6,
    "no-vehicle pressure zone": 1.5,
    "ghat/landmark": 1.4,
    "traffic choke point": 1.1,
    "parking belt": 0.9,
    "outer parking": 0.8,
    "parking": 0.8,
}
_RISK_BONUS: dict[str, float] = {"very high": 1.25, "high": 1.1, "medium": 1.0}


def _category_weight(node: dict[str, Any]) -> float:
    cat = (node.get("category") or "").strip().lower()
    w = _CATEGORY_WEIGHT.get(cat, 1.0)
    if node.get("kind") == "landmark":
        w = max(w, _CATEGORY_WEIGHT["ghat/landmark"])
    w *= _RISK_BONUS.get((node.get("risk") or "").strip().lower(), 1.0)
    return w


@lru_cache(maxsize=1)
def _scored_nodes() -> list[dict[str, Any]]:
    """Score every candidate node by report-density x category-weight.

    Deduplicates near-identical landmark points (the KML has Goda Ghat 1/2,
    Ganga Ghat 1/2 etc. within metres) by snapping to a small grid and keeping
    the highest-weighted representative.
    """
    raw = _chokepoints() + _landmarks()

    # Collapse landmarks/chokepoints that sit within ~80 m of each other.
    seen: dict[tuple[int, int], dict[str, Any]] = {}
    nodes: list[dict[str, Any]] = []
    for n in raw:
        gkey = (round(n["lat"] * 1400), round(n["lng"] * 1400))  # ~80 m grid
        if gkey in seen:
            # keep whichever has the heavier category weight / cleaner name
            if _category_weight(n) > _category_weight(seen[gkey]):
                seen[gkey].update(n)
            continue
        seen[gkey] = n
        nodes.append(n)

    scored: list[dict[str, Any]] = []
    for n in nodes:
        reports = _reports_near(n["lat"], n["lng"])
        weight = _category_weight(n)
        raw_score = reports * weight
        scored.append({
            "name": n["name"],
            "lat": round(n["lat"], 6),
            "lng": round(n["lng"], 6),
            "category": n.get("category") or n.get("kind"),
            "kind": n.get("kind"),
            "risk": n.get("risk"),
            "reports": reports,
            "weight": round(weight, 3),
            "_raw": raw_score,
        })

    max_raw = max((s["_raw"] for s in scored), default=0.0) or 1.0
    for s in scored:
        s["score"] = round(s["_raw"] / max_raw, 4)
        s["zone_id"] = _zone_for(s["lat"], s["lng"])
    scored.sort(key=lambda s: s["_raw"], reverse=True)
    return scored


# ---------------------------------------------------------------------------
# hotspots
# ---------------------------------------------------------------------------
def hotspots() -> list[dict[str, Any]]:
    """Ranked separation-risk nodes.

    Each item: ``name, lat, lng, score (0..1), reports, category, zone_id``.
    """
    out: list[dict[str, Any]] = []
    for s in _scored_nodes():
        out.append({
            "name": s["name"],
            "lat": s["lat"],
            "lng": s["lng"],
            "score": s["score"],
            "reports": s["reports"],
            "category": s["category"],
            "zone_id": s["zone_id"],
        })
    return out


# ---------------------------------------------------------------------------
# kiosk_recommendations
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def _coverage_anchors() -> list[dict[str, Any]]:
    """Existing help points: the 14 police stations + the ~10 help centers.

    Police stations have authoritative KML coordinates. Help-center coordinates
    are derived by geocoding the distinct ``reporting_center`` names found in the
    registry (so coverage reflects where help already exists).
    """
    anchors: list[dict[str, Any]] = [
        {"name": p["name"], "lat": p["lat"], "lng": p["lng"], "kind": "police"}
        for p in _police()
    ]

    from ..registry import store

    seen_centers: set[str] = set()
    for case in store.iter_cases():
        c = case.get("reporting_center")
        if not c or c in seen_centers:
            continue
        seen_centers.add(c)
        g = geocode(c)
        if g is not None:
            anchors.append({"name": c, "lat": g[0], "lng": g[1], "kind": "center"})
    return anchors


def _nearest_anchor(lat: float, lng: float) -> tuple[Optional[dict[str, Any]], float]:
    best, best_d = None, float("inf")
    for a in _coverage_anchors():
        d = haversine_m(lat, lng, a["lat"], a["lng"])
        if d < best_d:
            best, best_d = a, d
    return best, best_d


def kiosk_recommendations() -> list[dict[str, Any]]:
    """Recommend kiosk sites: HIGH separation risk INTERSECT LOW coverage.

    coverage_deficit = normalised distance-to-nearest-anchor, discounted by the
    local CCTV density. priority = risk_score * coverage_deficit. Returns a
    ranked list with a short human ``why``.
    """
    scored = _scored_nodes()
    if not scored:
        return []

    # Reference distance for normalising the coverage deficit: a node 2 km from
    # any help point is treated as maximally under-served.
    REF_DIST_M = 2000.0

    recs: list[dict[str, Any]] = []
    for s in scored:
        risk = s["score"]
        if risk <= 0:
            continue
        anchor, dist = _nearest_anchor(s["lat"], s["lng"])
        cams = _cctv_near(s["lat"], s["lng"])
        dist_factor = min(dist / REF_DIST_M, 1.0)
        # Cameras soften the deficit: each ~25 cameras halves the camera term.
        cctv_factor = 1.0 / (1.0 + cams / 25.0)
        coverage_deficit = round(0.6 * dist_factor + 0.4 * cctv_factor, 4)
        priority = round(risk * coverage_deficit, 4)

        anchor_name = anchor["name"] if anchor else "any help point"
        why = (
            f"{s['reports']} separations near {s['name']} "
            f"but nearest help point ({anchor_name}) {dist / 1000:.1f}km away, "
            f"{cams} cameras within {int(CCTV_RADIUS_M)}m"
        )
        recs.append({
            "name": s["name"],
            "lat": s["lat"],
            "lng": s["lng"],
            "score": priority,
            "risk_score": risk,
            "coverage_deficit": coverage_deficit,
            "reports": s["reports"],
            "nearest_help_m": round(dist, 1),
            "nearest_help": anchor_name,
            "cameras": cams,
            "category": s["category"],
            "zone_id": s["zone_id"],
            "why": why,
        })

    recs.sort(key=lambda r: r["score"], reverse=True)
    return recs


# ---------------------------------------------------------------------------
# build_geojson
# ---------------------------------------------------------------------------
def build_geojson() -> dict[str, Any]:
    """Rebuild and write ``frontend/public/geo/*.json`` from the source KMLs.

    Delegates to :mod:`app.geo.etl`. Clears this module's GeoJSON caches so a
    subsequent request reflects the freshly written files. Returns the
    ``{filename: feature_count}`` summary.
    """
    from . import etl

    etl.load_dataset.cache_clear()
    ds = etl.load_dataset()
    summary = etl.write_geojson_files(ds)

    # Invalidate cached GeoJSON-derived state so callers see the rebuild.
    for fn in (_zones, _cameras, _landmarks, _chokepoints, _police,
               _scored_nodes, _coverage_anchors):
        fn.cache_clear()

    return {"written_to": str(settings.geojson_out), "files": summary}
