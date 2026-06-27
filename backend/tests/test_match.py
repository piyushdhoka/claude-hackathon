"""Match engine tests — the hero feature.

Uses an injected in-memory pool (no DB dependency) via find_matches(..., pool=...).
Covers: cross-center top match, blank-name available-case matching, the
gender+age hard-mismatch cap, and self-exclusion for dedupe.
"""
from __future__ import annotations

from app.match import engine


def _case(cid, **over):
    base = dict(
        case_id=cid, case_type="missing", reported_at="2027-08-01 10:00",
        reporting_center="Nashik Road Center", name=None, gender="Female",
        age_band="71-80", language="Hindi", last_seen_location="Sadhugram Gate 2",
        lat=20.0, lng=73.79, state=None, district=None, description=None,
        attributes={},
    )
    base.update(over)
    return base


POOL = [
    _case("M-1", name="Kanta Trivedi"),
    _case("M-2", gender="Male", age_band="0-12", lat=19.9, lng=73.7,
          last_seen_location="Trimbak Road", language="Tamil"),
    _case("M-3", gender="Female", age_band="61-70", language="Hindi"),
]


def test_cross_center_top_match():
    """A found person matches the right missing report at a DIFFERENT center."""
    q = _case("Q", case_type="found", name="Kanta Trivedi",
              reporting_center="Ramkund Kho-Ya-Paya Kendra")
    res = engine.find_matches(q, case_type="missing", top_k=3, pool=POOL)
    assert res[0].case_id == "M-1"
    assert res[0].score >= 75
    # the matched candidate is from a different center than the query
    assert res[0].case["reporting_center"] != q["reporting_center"]


def test_blank_name_still_matches_on_attributes():
    """No name/mobile (the phoneless reality) still finds the person via geo+age+gender."""
    q = _case("Q2", case_type="found", name=None, mobile=None,
              reporting_center="Ramkund Kho-Ya-Paya Kendra")
    res = engine.find_matches(q, case_type="missing", top_k=3, pool=POOL)
    assert res and res[0].case_id == "M-1"
    assert "name_fuzzy" not in res[0].contributions  # dropped (available-case norm)


def test_gender_age_hard_mismatch_capped():
    q = _case("Q3", case_type="found", gender="Male", age_band="0-12",
              name="Kanta Trivedi")  # name collides but gender+age say different person
    res = engine.find_matches(q, case_type="missing", top_k=3, pool=POOL)
    m1 = next((r for r in res if r.case_id == "M-1"), None)
    assert m1 is not None and m1.score <= 25  # hard-rule cap


def test_self_exclusion():
    q = _case("M-1", name="Kanta Trivedi")  # same id as a pool member
    res = engine.find_matches(q, case_type="missing", top_k=3, pool=POOL)
    assert all(r.case_id != "M-1" for r in res)
