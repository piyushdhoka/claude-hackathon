"""F6 claim-fraud guard tests."""
from app.claim import service as claim
from app.registry import store


def _case(**over):
    base = {
        "case_id": "KMP-2027-00001",
        "gender": "Female",
        "age_band": "61-70",
        "attributes": {"clothing_colors": ["green"]},
    }
    base.update(over)
    return base


def _claim(**over):
    base = {
        "claim_id": "CLM-1",
        "claimant_id": "CITIZEN-A",
        "answers": {"gender": "Female", "clothing_color": "green"},
    }
    base.update(over)
    return base


def test_clean_adult_claim_allows_auto_reveal():
    v = claim.assess_claim(_claim(), _case(), history=[])
    assert v["band"] == "clear"
    assert v["allow_auto_reveal"] is True
    assert v["requires_guardian_consent"] is False
    assert v["flags"] == []


def test_minor_case_always_requires_guardian_consent():
    v = claim.assess_claim(_claim(), _case(age_band="0-12"), history=[])
    # even a clean claim on a minor cannot auto-reveal (DPDP §9)
    assert v["requires_guardian_consent"] is True
    assert v["allow_auto_reveal"] is False
    assert v["requires_supervisor"] is True


def test_one_claimant_many_children_is_blocked():
    history = [
        {"claimant_id": "CITIZEN-A", "case_id": "KMP-A", "age_band": "0-12", "status": "pending"},
        {"claimant_id": "CITIZEN-A", "case_id": "KMP-B", "age_band": "13-17", "status": "pending"},
    ]
    v = claim.assess_claim(
        _claim(case_id="KMP-C"), _case(case_id="KMP-C", age_band="0-12"), history=history,
    )
    assert "multiple_minor_claims" in v["flags"]
    assert v["band"] == "block"
    assert v["allow_auto_reveal"] is False


def test_answer_mismatch_raises_risk():
    bad = _claim(answers={"gender": "Male", "clothing_color": "red"})
    v = claim.assess_claim(bad, _case(), history=[])
    assert "answer_mismatch" in v["flags"]
    assert v["band"] in {"review", "block"}
    assert v["allow_auto_reveal"] is False


def test_repeat_rejected_claimant_flagged():
    history = [
        {"claimant_id": "CITIZEN-A", "case_id": "KMP-X", "age_band": "61-70", "status": "rejected"},
        {"claimant_id": "CITIZEN-A", "case_id": "KMP-Y", "age_band": "41-60", "status": "rejected"},
    ]
    v = claim.assess_claim(_claim(), _case(), history=history)
    assert "repeat_rejected" in v["flags"]


def test_process_claim_logs_flagged_event():
    history = [
        {"claimant_id": "CITIZEN-A", "case_id": "KMP-A", "age_band": "0-12", "status": "pending"},
        {"claimant_id": "CITIZEN-A", "case_id": "KMP-B", "age_band": "0-12", "status": "pending"},
    ]
    claim.process_claim(
        _claim(case_id="KMP-2027-00002"),
        _case(case_id="KMP-2027-00002", age_band="0-12"),
        history=history,
    )
    trail = store.get_audit_trail("KMP-2027-00002")
    assert any(e["type"] == "claim.flagged" for e in trail)


def test_claim_endpoint():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        ok = client.post("/claim/assess", json={
            "case_id": "KMP-2027-00001",
            "claim": {"claim_id": "E1", "claimant_id": "Z", "answers": {}},
            "history": [],
        })
        missing = client.post("/claim/assess", json={"case_id": "NOPE", "claim": {}})

    assert ok.status_code == 200
    body = ok.json()
    assert {"band", "flags", "allow_auto_reveal", "requires_supervisor"} <= set(body)
    assert missing.status_code == 404
