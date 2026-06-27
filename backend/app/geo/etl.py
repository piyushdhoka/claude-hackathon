"""KML -> normalized GeoJSON ETL for the Setu map.

Parses the three source KMLs with the stdlib ``xml.etree`` (no lxml dependency)
and emits GeoJSON ``FeatureCollection`` files into ``settings.geojson_out``
(``frontend/public/geo/``) that the Next.js map consumes directly:

    zones.json        32 zone POLYGONS (+ per-zone CCTV coverage count)
    cameras.json      ~4079 CCTV points, each tagged with a ``series`` prop
    landmarks.json    ~21 named ghat / station / kund polygons, as point markers
    chokepoints.json  85 chokepoints / transfer nodes / parking, with category + risk
    police.json       14 police stations

The parsed, in-memory dataset (cameras, zone polygons, landmark / chokepoint /
police nodes) is also reused by ``service.py`` for geocoding, point-in-polygon
zone assignment and hotspot / kiosk scoring, so the KMLs are parsed exactly once
per process via :func:`load_dataset`.

Run standalone:  ``uv run python -m app.geo.etl``
"""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from ..config import settings

KML_NS = "{http://www.opengis.net/kml/2.2}"

# --- CCTV camera series classification (by placemark name) -------------------
_SERIES_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("Z#-C#", re.compile(r"^Z\d+-C\d+$", re.I)),
    ("C-#", re.compile(r"^C-\d+$", re.I)),
    ("M-#", re.compile(r"^M-\d+$", re.I)),
    ("RRC #", re.compile(r"^RRC\s*\d+$", re.I)),
    ("G-#", re.compile(r"^G-\d+$", re.I)),
]
_ZONE_RE = re.compile(r"^Zone Area \d+$", re.I)


def _classify_series(name: str) -> Optional[str]:
    for label, pat in _SERIES_PATTERNS:
        if pat.match(name):
            return label
    return None


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------
@dataclass
class Node:
    """A named point of interest (landmark, chokepoint or police station)."""

    name: str
    lat: float
    lng: float
    kind: str                      # "landmark" | "chokepoint" | "police"
    category: Optional[str] = None  # chokepoint category / landmark sub-type
    risk: Optional[str] = None      # chokepoint risk label
    note: Optional[str] = None


@dataclass
class Zone:
    zone_id: str                   # e.g. "Zone Area 1"
    ring: list[tuple[float, float]]  # (lng, lat) outer boundary
    centroid: tuple[float, float]    # (lng, lat)
    camera_count: int = 0


@dataclass
class Camera:
    name: str
    lat: float
    lng: float
    series: str
    zone_id: Optional[str] = None


@dataclass
class Dataset:
    zones: list[Zone] = field(default_factory=list)
    cameras: list[Camera] = field(default_factory=list)
    landmarks: list[Node] = field(default_factory=list)
    chokepoints: list[Node] = field(default_factory=list)
    police: list[Node] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Low-level KML helpers
# ---------------------------------------------------------------------------
def _parse_coords(text: str) -> list[tuple[float, float]]:
    """Parse a KML ``<coordinates>`` blob ("lng,lat,alt" tuples) -> [(lng, lat)]."""
    out: list[tuple[float, float]] = []
    for tok in text.replace("\n", " ").split():
        parts = tok.split(",")
        if len(parts) >= 2:
            try:
                out.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
    return out


def _ring_centroid(ring: list[tuple[float, float]]) -> tuple[float, float]:
    """Area-weighted polygon centroid; falls back to vertex mean if degenerate."""
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    n = len(pts)
    if n == 0:
        return (0.0, 0.0)
    if n < 3:
        return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    area = cx = cy = 0.0
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    area *= 0.5
    if abs(area) < 1e-12:
        return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n)
    return (cx / (6 * area), cy / (6 * area))


def _placemark_name(pm: ET.Element) -> str:
    nm = pm.find(f"{KML_NS}name")
    return nm.text.strip() if nm is not None and nm.text else ""


def _placemark_point(pm: ET.Element) -> Optional[tuple[float, float]]:
    c = pm.find(f".//{KML_NS}Point/{KML_NS}coordinates")
    if c is None or not c.text:
        return None
    coords = _parse_coords(c.text)
    return coords[0] if coords else None


def _placemark_outer_ring(pm: ET.Element) -> Optional[list[tuple[float, float]]]:
    c = pm.find(f".//{KML_NS}Polygon/{KML_NS}outerBoundaryIs//{KML_NS}coordinates")
    if c is None or not c.text:
        return None
    ring = _parse_coords(c.text)
    return ring or None


_KV_RE = re.compile(r"([A-Za-z ]+):\s*([^|]+)")


def _parse_description(desc: Optional[str]) -> dict[str, str]:
    """Split the "Category: X | Risk: Y | Note: Z" chokepoint description."""
    if not desc:
        return {}
    return {m.group(1).strip().lower(): m.group(2).strip() for m in _KV_RE.finditer(desc)}


# ---------------------------------------------------------------------------
# Per-file parsers
# ---------------------------------------------------------------------------
def parse_cctv(path: Path) -> tuple[list[Zone], list[Camera], list[Node]]:
    """Parse CCTV Dataset.kml -> (zones, cameras, landmark nodes).

    Named landmarks (Ram Kund, Dasak Ghat, ...) are stored in the KML as small
    polygons; we expose them as point markers using their polygon centroid.
    """
    root = ET.parse(path).getroot()
    zones: list[Zone] = []
    cameras: list[Camera] = []
    landmarks: list[Node] = []

    for pm in root.iter(f"{KML_NS}Placemark"):
        name = _placemark_name(pm)
        if not name:
            continue
        point = _placemark_point(pm)
        ring = _placemark_outer_ring(pm)

        if point is not None:
            series = _classify_series(name)
            if series is None:
                series = "OTHER"
            cameras.append(Camera(name=name, lat=point[1], lng=point[0], series=series))
        elif ring is not None:
            centroid = _ring_centroid(ring)
            if _ZONE_RE.match(name):
                zones.append(Zone(zone_id=name, ring=ring, centroid=centroid))
            else:
                # named landmark polygon -> point marker at its centroid
                landmarks.append(
                    Node(name=name, lat=centroid[1], lng=centroid[0],
                         kind="landmark", category="ghat/landmark")
                )
    return zones, cameras, landmarks


def parse_police(path: Path) -> list[Node]:
    root = ET.parse(path).getroot()
    out: list[Node] = []
    for pm in root.iter(f"{KML_NS}Placemark"):
        name = _placemark_name(pm)
        point = _placemark_point(pm)
        if name and point is not None:
            out.append(Node(name=name, lat=point[1], lng=point[0], kind="police"))
    return out


def parse_chokepoints(path: Path) -> list[Node]:
    root = ET.parse(path).getroot()
    out: list[Node] = []
    for pm in root.iter(f"{KML_NS}Placemark"):
        name = _placemark_name(pm)
        point = _placemark_point(pm)
        if not (name and point is not None):
            continue
        desc = pm.find(f"{KML_NS}description")
        meta = _parse_description(desc.text if desc is not None else None)
        out.append(Node(
            name=name, lat=point[1], lng=point[0], kind="chokepoint",
            category=meta.get("category"), risk=meta.get("risk"), note=meta.get("note"),
        ))
    return out


# ---------------------------------------------------------------------------
# Point-in-polygon zone assignment (ray casting; shapely used in service.py)
# ---------------------------------------------------------------------------
def point_in_ring(lng: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    """Ray-casting test. ``ring`` is a list of (lng, lat) vertices."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi
        ):
            inside = not inside
        j = i
    return inside


def assign_zone(lng: float, lat: float, zones: list[Zone]) -> Optional[str]:
    for z in zones:
        if point_in_ring(lng, lat, z.ring):
            return z.zone_id
    return None


# ---------------------------------------------------------------------------
# Dataset assembly (parsed once, cached)
# ---------------------------------------------------------------------------
@lru_cache(maxsize=1)
def load_dataset() -> Dataset:
    """Parse all three KMLs once and return the normalized dataset.

    Also assigns each camera to its containing zone and counts cameras per zone.
    """
    zones, cameras, landmarks = parse_cctv(settings.cctv_kml)
    police = parse_police(settings.police_kml)
    chokepoints = parse_chokepoints(settings.chokepoints_kml)

    for cam in cameras:
        zid = assign_zone(cam.lng, cam.lat, zones)
        cam.zone_id = zid
    counts: dict[str, int] = {}
    for cam in cameras:
        if cam.zone_id:
            counts[cam.zone_id] = counts.get(cam.zone_id, 0) + 1
    for z in zones:
        z.camera_count = counts.get(z.zone_id, 0)

    return Dataset(zones=zones, cameras=cameras, landmarks=landmarks,
                   chokepoints=chokepoints, police=police)


# ---------------------------------------------------------------------------
# GeoJSON emitters
# ---------------------------------------------------------------------------
def _feature(geometry: dict[str, Any], props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": props}


def _fc(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def _point(lng: float, lat: float) -> dict[str, Any]:
    return {"type": "Point", "coordinates": [round(lng, 7), round(lat, 7)]}


def zones_geojson(ds: Dataset) -> dict[str, Any]:
    feats = []
    for z in ds.zones:
        feats.append(_feature(
            {"type": "Polygon", "coordinates": [[[round(x, 7), round(y, 7)] for x, y in z.ring]]},
            {"zone_id": z.zone_id, "name": z.zone_id, "camera_count": z.camera_count,
             "centroid": [round(z.centroid[0], 7), round(z.centroid[1], 7)]},
        ))
    return _fc(feats)


def cameras_geojson(ds: Dataset) -> dict[str, Any]:
    feats = [
        _feature(_point(c.lng, c.lat),
                 {"name": c.name, "series": c.series, "zone_id": c.zone_id})
        for c in ds.cameras
    ]
    return _fc(feats)


def landmarks_geojson(ds: Dataset) -> dict[str, Any]:
    feats = [
        _feature(_point(n.lng, n.lat),
                 {"name": n.name, "kind": n.kind, "category": n.category})
        for n in ds.landmarks
    ]
    return _fc(feats)


def chokepoints_geojson(ds: Dataset) -> dict[str, Any]:
    feats = [
        _feature(_point(n.lng, n.lat),
                 {"name": n.name, "category": n.category, "risk": n.risk, "note": n.note})
        for n in ds.chokepoints
    ]
    return _fc(feats)


def police_geojson(ds: Dataset) -> dict[str, Any]:
    feats = [
        _feature(_point(n.lng, n.lat), {"name": n.name, "kind": "police"})
        for n in ds.police
    ]
    return _fc(feats)


def write_geojson_files(ds: Optional[Dataset] = None) -> dict[str, int]:
    """Write all GeoJSON FeatureCollections to ``settings.geojson_out``.

    Returns a ``{filename: feature_count}`` summary.
    """
    ds = ds or load_dataset()
    out_dir: Path = settings.geojson_out
    out_dir.mkdir(parents=True, exist_ok=True)

    files = {
        "zones.json": zones_geojson(ds),
        "cameras.json": cameras_geojson(ds),
        "landmarks.json": landmarks_geojson(ds),
        "chokepoints.json": chokepoints_geojson(ds),
        "police.json": police_geojson(ds),
    }
    summary: dict[str, int] = {}
    for fname, fc in files.items():
        (out_dir / fname).write_text(
            json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        summary[fname] = len(fc["features"])
    return summary


def main() -> None:
    ds = load_dataset()
    summary = write_geojson_files(ds)
    print(f"GeoJSON written to {settings.geojson_out}")
    for fname, n in summary.items():
        print(f"  {fname:18s} {n:5d} features")
    by_series: dict[str, int] = {}
    for c in ds.cameras:
        by_series[c.series] = by_series.get(c.series, 0) + 1
    print(f"  camera series      {by_series}")
    print(f"  zones={len(ds.zones)} landmarks={len(ds.landmarks)} "
          f"chokepoints={len(ds.chokepoints)} police={len(ds.police)}")


if __name__ == "__main__":
    main()
