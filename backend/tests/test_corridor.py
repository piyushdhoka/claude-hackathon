"""F2 CCTV search-corridor tests."""
from app.geo import corridor, service

ORIGIN = "Ramkund Ghat"  # a canonical, camera-dense last-seen location


def test_corridor_returns_ranked_cameras_within_radius():
    result = corridor.search_corridor(ORIGIN, radius_m=2000, top_k=15)
    assert result is not None

    cams = result["cameras"]
    assert 0 < len(cams) <= 15
    for c in cams:
        assert {"camera_id", "lat", "lng", "distance_m", "score", "on_corridor"} <= set(c)
        assert c["distance_m"] <= 2000.0

    # ranked by score descending
    scores = [c["score"] for c in cams]
    assert scores == sorted(scores, reverse=True)


def test_corridor_drift_target_is_nearest_egress_node():
    result = corridor.search_corridor(ORIGIN, radius_m=2000, top_k=15)
    target = result["drift_target"]
    assert target is not None
    assert target["category"] in corridor.EGRESS_CATEGORIES

    olat, olng = result["origin"]["lat"], result["origin"]["lng"]
    target_d = service.haversine_m(olat, olng, target["lat"], target["lng"])
    # No egress node is closer to the origin than the chosen drift target.
    for node in corridor.egress_nodes():
        assert target_d <= service.haversine_m(olat, olng, node["lat"], node["lng"]) + 1e-6


def test_corridor_unknown_location_returns_none():
    assert corridor.search_corridor("Zzqqxx Nowhere 9000") is None


def test_corridor_endpoint():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        ok = client.get("/geo/corridor", params={"location": ORIGIN, "radius_m": 2000})
        missing = client.get("/geo/corridor", params={"location": "Zzqqxx Nowhere 9000"})

    assert ok.status_code == 200
    body = ok.json()
    assert body["cameras"] and "drift_target" in body
    assert missing.status_code == 404
