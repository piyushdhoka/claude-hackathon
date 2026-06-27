"""F3 triage API tests."""
from fastapi.testclient import TestClient

from app.main import app


def test_triage_queue_ranked_and_annotated():
    with TestClient(app) as client:
        r = client.get("/triage/queue", params={"limit": 100})
    assert r.status_code == 200
    data = r.json()
    assert len(data) > 0

    # sorted by vulnerability desc
    vulns = [c["vulnerability"] for c in data]
    assert vulns == sorted(vulns, reverse=True)

    # every entry annotated by the triage service
    for c in data:
        assert "vulnerability" in c
        assert "eta_hours" in c
        assert "sla_breach" in c


def test_triage_queue_masks_mobile_by_default():
    with TestClient(app) as client:
        masked = client.get("/triage/queue", params={"limit": 200}).json()
        revealed = client.get(
            "/triage/queue",
            params={"limit": 200},
            headers={"x-role": "supervisor"},
        ).json()

    # at least one revealed case has a real (unmasked) mobile number
    real = [c for c in revealed if c.get("mobile") and "•" not in c["mobile"]]
    assert real, "expected some cases with a mobile in the registry"

    # the default (operator) view never exposes a raw number
    for c in masked:
        if c.get("mobile"):
            assert "•" in c["mobile"]
