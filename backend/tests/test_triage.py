"""F3 triage tests."""
from app.registry import store
from app.triage.service import (
    build_priority_queue,
    predict_eta_hours,
    vulnerability_score,
)


def _case(**over):
    base = {
        "case_id": "C1",
        "age_band": "18-40",
        "status": "Pending",
        "mobile": "+91 9000000000",
        "reported_at": "2027-07-28 14:00",
    }
    base.update(over)
    return base


# --------------------------------------------------------------------------- #
# vulnerability_score
# --------------------------------------------------------------------------- #
def test_child_and_elder_rank_above_adult():
    adult = vulnerability_score(_case(age_band="18-40"))
    child = vulnerability_score(_case(age_band="0-12"))
    elder = vulnerability_score(_case(age_band="80+"))
    assert child > adult
    assert elder > adult


def test_hospital_status_increases_vulnerability():
    base = vulnerability_score(_case(age_band="41-60", status="Pending"))
    hosp = vulnerability_score(_case(age_band="41-60", status="Transferred to hospital"))
    assert hosp > base


def test_missing_mobile_increases_vulnerability():
    has = vulnerability_score(_case(mobile="+91 9000000000"))
    miss = vulnerability_score(_case(mobile=""))
    assert miss > has


def test_night_report_increases_vulnerability():
    day = vulnerability_score(_case(reported_at="2027-07-28 14:00"))
    night = vulnerability_score(_case(reported_at="2027-07-28 02:00"))
    assert night > day


# --------------------------------------------------------------------------- #
# predict_eta_hours
# --------------------------------------------------------------------------- #
def test_eta_is_median_resolution_for_age_band():
    history = [
        {"age_band": "61-70", "resolution_hours": 2.0},
        {"age_band": "61-70", "resolution_hours": 4.0},
        {"age_band": "61-70", "resolution_hours": 6.0},
        {"age_band": "0-12", "resolution_hours": 100.0},  # other band, ignored
    ]
    assert predict_eta_hours(_case(age_band="61-70"), history) == 4.0


def test_eta_falls_back_to_overall_median_when_band_absent():
    history = [
        {"age_band": "18-40", "resolution_hours": 2.0},
        {"age_band": "18-40", "resolution_hours": 4.0},
    ]
    assert predict_eta_hours(_case(age_band="80+"), history) == 3.0


# --------------------------------------------------------------------------- #
# build_priority_queue
# --------------------------------------------------------------------------- #
def test_priority_queue_sorted_by_vulnerability_with_sla_flags():
    history = [{"age_band": "0-12", "resolution_hours": 9.0}]
    cases = [
        _case(case_id="ADULT", age_band="18-40"),
        _case(case_id="CHILD", age_band="0-12"),
    ]
    queue = build_priority_queue(cases, history, sla_hours=6.0)

    assert [c["case_id"] for c in queue] == ["CHILD", "ADULT"]
    child = queue[0]
    assert child["vulnerability"] == vulnerability_score(cases[1])
    assert child["eta_hours"] == 9.0
    assert child["sla_breach"] is True  # 9.0 > 6.0


# --------------------------------------------------------------------------- #
# integration: run on the real seeded registry
# --------------------------------------------------------------------------- #
def test_priority_queue_runs_on_real_registry():
    reunited = store.list_cases(status="Reunited", limit=5000)
    history = [r for r in reunited if r.get("resolution_hours") is not None]
    assert len(history) > 100  # plenty of resolved cases to learn ETA from

    open_cases = (
        store.list_cases(status="Pending", limit=5000)
        + store.list_cases(status="Transferred to hospital", limit=5000)
        + store.list_cases(status="Unresolved", limit=5000)
    )
    assert open_cases, "expected some unresolved cases in the seeded registry"

    queue = build_priority_queue(open_cases, history)
    assert len(queue) == len(open_cases)
    vulns = [c["vulnerability"] for c in queue]
    assert vulns == sorted(vulns, reverse=True)
    # Every annotated case carries an ETA prediction (history is non-empty).
    assert all(c["eta_hours"] is not None for c in queue)
