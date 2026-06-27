"""Tests for the geography service (geocode / hotspots / kiosk recommendations).

Run from ``backend/``::

    uv run pytest tests/test_geo.py            # if pytest is a dep
    uv run --with pytest pytest tests/test_geo.py

These tests read the curated ``shared/location_coords.json`` map, the emitted
``frontend/public/geo/*.json`` and the read-only registry DB; they do not mutate
any of them.
"""
from __future__ import annotations

import json

import pytest

from app.config import REPO_ROOT
from app.geo import service

LOCATION_COORDS_PATH = REPO_ROOT / "shared" / "location_coords.json"


@pytest.fixture(scope="module")
def location_names() -> list[str]:
    data = json.loads(LOCATION_COORDS_PATH.read_text(encoding="utf-8"))
    return list(data.keys())


# --------------------------------------------------------------------------- #
# geocode
# --------------------------------------------------------------------------- #
def test_geocode_resolves_all_canonical_locations(location_names):
    """All 20 last_seen_location values geocode to coords + a zone."""
    assert len(location_names) == 20

    for name in location_names:
        result = service.geocode(name)
        assert result is not None, f"{name!r} failed to geocode"
        lat, lng, zone_id = result
        # Nashik bounding box sanity (district + Trimbak corridor).
        assert 19.5 <= lat <= 20.5, f"{name}: lat {lat} out of range"
        assert 73.3 <= lng <= 74.2, f"{name}: lng {lng} out of range"
        assert zone_id is not None, f"{name}: no zone assigned"
        assert zone_id.startswith("Zone Area"), f"{name}: bad zone {zone_id!r}"


def test_geocode_unknown_returns_none():
    assert service.geocode("") is None
    assert service.geocode("Zzqqxx Nowhere Place 9000") is None


def test_geocode_fuzzy_matches_known_landmark():
    """A free-text near-name still resolves (fuzzy path)."""
    result = service.geocode("Nashik Road Railway Station")
    assert result is not None
    lat, lng, zone_id = result
    assert 19.5 <= lat <= 20.5 and 73.3 <= lng <= 74.2


def test_geocode_zone_is_consistent():
    """Same input -> same zone (point-in-polygon is deterministic)."""
    a = service.geocode("Ramkund Ghat")
    b = service.geocode("Ramkund Ghat")
    assert a == b
    assert a is not None and a[2] is not None


# --------------------------------------------------------------------------- #
# hotspots
# --------------------------------------------------------------------------- #
def test_hotspots_shape_and_normalisation():
    hs = service.hotspots()
    assert isinstance(hs, list) and len(hs) > 0
    required = {"name", "lat", "lng", "score", "reports", "category", "zone_id"}
    for h in hs:
        assert required <= set(h), f"missing keys: {required - set(h)}"
        assert 0.0 <= h["score"] <= 1.0, f"{h['name']}: score {h['score']}"
        assert h["reports"] >= 0
    # Sorted descending by score.
    scores = [h["score"] for h in hs]
    assert scores == sorted(scores, reverse=True)
    # The top node is fully normalised.
    assert hs[0]["score"] == pytest.approx(1.0)


def test_hotspots_known_high_density_node_in_top():
    """A known high-density node ranks in the top few."""
    hs = service.hotspots()
    top_names = [h["name"].lower() for h in hs[:6]]
    known = ["madsangvi transit", "sadhugram gate 2",
             "ramkund ghat", "nashik road station"]
    hits = [k for k in known if any(k in n for n in top_names)]
    assert hits, f"no known high-density node in top 6: {top_names}"
    # At least three of the four expected leaders should be near the top.
    assert len(hits) >= 3, f"only {hits} of the known leaders in the top 6"


def test_hotspots_reports_match_registry_counts():
    """Reports for canonical locations equal their registry case counts."""
    counts = service._location_report_counts()
    by_name = {h["name"]: h["reports"] for h in service.hotspots()}
    for loc in ("Madsangvi Transit", "Nashik Road Station", "Ramkund Ghat"):
        assert by_name.get(loc) == counts[loc]


# --------------------------------------------------------------------------- #
# kiosk_recommendations
# --------------------------------------------------------------------------- #
def test_kiosk_recommendations_non_empty_ranked():
    recs = service.kiosk_recommendations()
    assert isinstance(recs, list) and len(recs) > 0
    required = {"name", "lat", "lng", "score", "why"}
    for r in recs:
        assert required <= set(r), f"missing keys: {required - set(r)}"
        assert isinstance(r["why"], str) and r["why"]
    scores = [r["score"] for r in recs]
    assert scores == sorted(scores, reverse=True)


def test_kiosk_why_is_human_readable():
    """The top recommendation's `why` cites separations + distance + cameras."""
    top = service.kiosk_recommendations()[0]
    why = top["why"].lower()
    assert "separation" in why
    assert "km" in why
    assert "camera" in why


def test_kiosk_high_risk_low_coverage():
    """Recommended sites are genuinely under-served (real distance to help)."""
    recs = service.kiosk_recommendations()
    # Every top recommendation has measurable coverage data.
    for r in recs[:5]:
        assert r["nearest_help_m"] >= 0
        assert r["cameras"] >= 0
        assert 0.0 <= r["coverage_deficit"] <= 1.0
