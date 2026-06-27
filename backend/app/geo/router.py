"""Geography API: hotspots, kiosk recommendations, geocoding."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from . import service

router = APIRouter(prefix="/geo", tags=["geo"])


@router.get("/hotspots")
def hotspots():
    try:
        return service.hotspots()
    except NotImplementedError:
        raise HTTPException(501, "geo service not yet implemented")


@router.get("/kiosks")
def kiosks():
    try:
        return service.kiosk_recommendations()
    except NotImplementedError:
        raise HTTPException(501, "geo service not yet implemented")


@router.get("/geocode")
def geocode(location: str):
    try:
        res = service.geocode(location)
    except NotImplementedError:
        raise HTTPException(501, "geo service not yet implemented")
    if not res:
        raise HTTPException(404, "location not found")
    lat, lng, zone = res
    return {"location": location, "lat": lat, "lng": lng, "zone_id": zone}
