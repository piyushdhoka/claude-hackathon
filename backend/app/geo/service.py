"""Geography service — CONTRACT STUB (to be implemented by the geo agent).

Public contract:

    geocode(last_seen_location: str) -> tuple[lat, lng, zone_id] | None
    hotspots() -> list[dict]            # ranked separation-risk nodes
    kiosk_recommendations() -> list[dict]  # high risk INTERSECT low coverage
    build_geojson() -> dict             # writes frontend/public/geo/*.json

Implementation notes for the agent:
- ETL parses the 3 KMLs (CCTV Dataset.kml has 32 zone POLYGONS + ~4079 cameras +
  ~22 named landmarks; police + chokepoints KMLs mirror their CSVs).
- Geocode each of the 20 last_seen_location values to real coords by name-matching
  KML landmarks + chokepoints; fall back to nearest zone centroid.
- Use shapely for point-in-polygon zone assignment.
- Hotspot score = report density (from registry) x node-category weight; coverage
  deficit = distance to centers/police + CCTV density. Kiosk = high risk & low coverage.
- Write normalized GeoJSON to settings.geojson_out for the frontend map to consume.
"""
from __future__ import annotations

from typing import Any, Optional


def geocode(last_seen_location: str) -> Optional[tuple[float, float, Optional[str]]]:
    raise NotImplementedError("geo.service.geocode not yet implemented")


def hotspots() -> list[dict[str, Any]]:
    raise NotImplementedError("geo.service.hotspots not yet implemented")


def kiosk_recommendations() -> list[dict[str, Any]]:
    raise NotImplementedError("geo.service.kiosk_recommendations not yet implemented")


def build_geojson() -> dict[str, Any]:
    raise NotImplementedError("geo.service.build_geojson not yet implemented")
