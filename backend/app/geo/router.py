"""Geography API: hotspots, kiosk recommendations, geocoding."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from . import corridor, route, service

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


@router.get("/corridor")
def corridor_search(location: str, radius_m: float = 1500.0, top_k: int = 15):
    """CCTV cameras to review near a last-seen location, ranked + drift-biased."""
    res = corridor.search_corridor(location, radius_m=radius_m, top_k=top_k)
    if res is None:
        raise HTTPException(404, "location not found")
    return res


@router.get("/handoff")
def handoff(location: str, k: int = 3):
    """Nearest police station / help center to route a reunited family to."""
    res = route.handoff_route(location, k=k)
    if res is None:
        raise HTTPException(404, "location not found")
    return res


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
