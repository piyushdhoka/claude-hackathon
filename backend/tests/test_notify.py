"""F1 SMS/IVR notify-on-match tests."""
from app.notify import templates
from app.notify.provider import MockProvider
from app.notify.service import notify_match
from app.registry import store


def _missing(**over):
    base = {
        "case_id": "KMP-2027-00001",
        "language": "Marathi",
        "mobile": "+91 6734036506",
        "consent": True,
    }
    base.update(over)
    return base


def test_notify_sends_localized_message_to_raw_number():
    prov = MockProvider()
    res = notify_match(_missing(), center="Panchavati Center", code="4821", provider=prov)

    assert res["sent"] is True
    assert len(prov.sent) == 1
    # provider dials the REAL number; message is in the case's language.
    assert prov.sent[0]["to"] == "+91 6734036506"
    assert prov.sent[0]["message"] == templates.render("Marathi", "Panchavati Center", "4821")
    assert "Panchavati Center" in prov.sent[0]["message"]
    assert "4821" in prov.sent[0]["message"]


def test_notify_blocked_without_consent():
    prov = MockProvider()
    res = notify_match(_missing(consent=False), center="X", code="1", provider=prov)
    assert res["sent"] is False
    assert res["reason"] == "no_consent"
    assert prov.sent == []


def test_notify_skipped_when_no_mobile():
    prov = MockProvider()
    res = notify_match(_missing(mobile=None), center="X", code="1", provider=prov)
    assert res["sent"] is False
    assert res["reason"] == "no_mobile"
    assert prov.sent == []


def test_notify_never_exposes_raw_number_in_result():
    prov = MockProvider()
    res = notify_match(_missing(), center="X", code="1", provider=prov)
    assert "•" in res["masked_to"]
    # the raw number must not leak anywhere in the operator-facing result
    assert "6734036506" not in str(res)


def test_notify_logs_pii_notified_audit_event():
    prov = MockProvider()
    notify_match(_missing(), center="Panchavati Center", code="4821", provider=prov)
    trail = store.get_audit_trail("KMP-2027-00001")
    assert any(e["type"] == "pii.notified" for e in trail)


def test_template_falls_back_to_english_for_unknown_language():
    msg = templates.render("Klingon", "Center A", "999")
    assert msg == templates.render("English", "Center A", "999")


def test_notify_endpoint_masks_and_handles_missing_case():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        ok = client.post("/notify/match", json={
            "case_id": "KMP-2027-00001", "center": "Panchavati Center", "code": "4821",
        })
        missing = client.post("/notify/match", json={"case_id": "NOPE-0000"})

    assert ok.status_code == 200
    body = ok.json()
    assert "•" in body["masked_to"]
    assert "6734036506" not in str(body)
    assert missing.status_code == 404
