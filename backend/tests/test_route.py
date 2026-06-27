"""F5 reunion handoff-routing tests."""
from app.geo import route, service

LOC = "Ramkund Ghat"


def test_handoff_returns_nearest_help_point_with_heading():
    res = route.handoff_route(LOC, k=3)
    assert res is not None

    dest = res["destination"]
    assert {"name", "kind", "lat", "lng", "distance_m", "heading"} <= set(dest)
    assert dest["distance_m"] >= 0
    assert dest["heading"] in {"N", "NE", "E", "SE", "S", "SW", "W", "NW"}
    assert dest["kind"] in {"police", "center"}


def test_handoff_destination_is_the_closest_anchor():
    res = route.handoff_route(LOC, k=5)
    options = res["options"]
    # options sorted ascending by distance, destination is the first
    dists = [o["distance_m"] for o in options]
    assert dists == sorted(dists)
    assert res["destination"]["name"] == options[0]["name"]

    # genuinely the closest over ALL anchors
    olat, olng = res["origin"]["lat"], res["origin"]["lng"]
    nearest = min(
        service._coverage_anchors(),
        key=lambda a: service.haversine_m(olat, olng, a["lat"], a["lng"]),
    )
    assert res["destination"]["name"] == nearest["name"]


def test_handoff_unknown_location_returns_none():
    assert route.handoff_route("Zzqqxx Nowhere 9000") is None


def test_handoff_endpoint():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        ok = client.get("/geo/handoff", params={"location": LOC})
        missing = client.get("/geo/handoff", params={"location": "Zzqqxx Nowhere 9000"})

    assert ok.status_code == 200
    assert "destination" in ok.json()
    assert missing.status_code == 404
