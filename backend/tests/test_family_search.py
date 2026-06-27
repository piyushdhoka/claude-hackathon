"""F4 family self-search tests."""
from app.geo import service
from app.search import service as search


def test_build_family_query_geocodes_location():
    q = search.build_family_query({
        "gender": "Female",
        "age_band": "61-70",
        "language": "Marathi",
        "last_seen_location": "Ramkund Ghat",
        "clothing_colors": ["green"],
    })
    assert q["lat"] is not None and q["lng"] is not None
    assert q["zone_id"] is not None
    # Attribute taps land on the nested attributes block the engine reads.
    assert "green" in q["attributes"]["clothing_colors"]


def test_family_search_finds_matching_found_person():
    lat, lng, _ = service.geocode("Ramkund Ghat")
    pool = [
        {  # the real match: a found elder, same age/gender/language, same place
            "case_id": "FOUND-MATCH", "case_type": "found",
            "gender": "Female", "age_band": "61-70", "language": "Marathi",
            "lat": lat, "lng": lng, "reported_at": "2027-07-28 12:30",
        },
        {  # distractor: different gender + far younger, elsewhere
            "case_id": "FOUND-OTHER", "case_type": "found",
            "gender": "Male", "age_band": "18-40", "language": "Tamil",
            "lat": lat + 0.05, "lng": lng + 0.05, "reported_at": "2027-07-28 12:30",
        },
    ]
    payload = {
        "gender": "Female", "age_band": "61-70", "language": "Marathi",
        "last_seen_location": "Ramkund Ghat", "reported_at": "2027-07-28 12:00",
    }
    results = search.search_family(payload, top_k=5, pool=pool)
    assert results, "expected at least one candidate"
    assert results[0]["case_id"] == "FOUND-MATCH"
    assert results[0]["score"] > 0


def test_family_search_endpoint_masks_pii():
    from fastapi.testclient import TestClient

    from app.main import app

    payload = {
        "gender": "Female", "age_band": "61-70", "language": "Marathi",
        "last_seen_location": "Ramkund Ghat",
    }
    with TestClient(app) as client:
        r = client.post("/search/family", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    for cand in data:
        mob = (cand.get("case") or {}).get("mobile")
        if mob:
            assert "•" in mob  # never a raw number in the family-facing view
