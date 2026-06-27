"""F1 — real (Twilio) provider tests. HTTP is injected, so nothing is sent."""
from app.notify.provider import MockProvider, TwilioProvider, make_provider


def _recorder():
    calls: list[dict] = []

    def poster(url, data, auth):
        calls.append({"url": url, "data": data, "auth": auth})
        return {"sid": "SM_test"}

    return calls, poster


def test_twilio_sms_posts_to_messages_endpoint():
    calls, poster = _recorder()
    p = TwilioProvider("ACxxx", "tok", "+15550001111", poster=poster)
    p.send("+919579925834", "hello family")

    c = calls[0]
    assert c["url"].endswith("/Accounts/ACxxx/Messages.json")
    assert c["data"]["To"] == "+919579925834"
    assert c["data"]["From"] == "+15550001111"
    assert c["data"]["Body"] == "hello family"
    assert c["auth"] == ("ACxxx", "tok")


def test_twilio_ivr_posts_twiml_to_calls_endpoint():
    calls, poster = _recorder()
    p = TwilioProvider("ACxxx", "tok", "+15550001111", voice_from="+15559998888", poster=poster)
    p.call("+919579925834", "your family member is safe")

    c = calls[0]
    assert c["url"].endswith("/Accounts/ACxxx/Calls.json")
    assert c["data"]["To"] == "+919579925834"
    assert c["data"]["From"] == "+15559998888"
    assert "<Response>" in c["data"]["Twiml"]
    assert "your family member is safe" in c["data"]["Twiml"]


def test_make_provider_returns_twilio_with_creds():
    p = make_provider("twilio", sid="ACxxx", token="tok", sms_from="+15550001111")
    assert isinstance(p, TwilioProvider)
    assert p.name == "twilio"


def test_make_provider_falls_back_to_mock_without_creds():
    assert isinstance(make_provider("twilio", sid="", token="", sms_from=""), MockProvider)
    assert isinstance(make_provider("mock", sid="x", token="x", sms_from="x"), MockProvider)
