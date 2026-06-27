"""Notify channel abstraction.

The deterministic core depends only on the ``send`` interface. Two providers:

  * ``MockProvider``  — in-memory/console, offline-safe default for the demo.
  * ``TwilioProvider`` — real SMS (Messages API) + IVR voice (Calls API with
    TwiML <Say>), selected when ``NOTIFY_PROVIDER=twilio`` and creds are set.

``make_provider`` picks one from config; HTTP is injected (``poster``) so the
real provider is unit-testable without sending anything.
"""
from __future__ import annotations

from typing import Callable, Optional, Protocol

# poster(url, data, auth) -> json dict. Injected for tests; real default uses httpx.
Poster = Callable[[str, dict, tuple[str, str]], dict]

_TWILIO_BASE = "https://api.twilio.com/2010-04-01"


class SmsProvider(Protocol):
    name: str

    def send(self, to: str, message: str) -> None:
        ...


class MockProvider:
    """Records messages in memory (and echoes to stdout) instead of dialing."""

    name = "mock"

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    def send(self, to: str, message: str) -> None:
        self.sent.append({"to": to, "message": message, "channel": "sms"})
        print(f"[notify:mock] SMS -> {to}: {message}")

    def call(self, to: str, message: str) -> None:
        self.sent.append({"to": to, "message": message, "channel": "ivr"})
        print(f"[notify:mock] IVR -> {to}: {message}")


def _httpx_post(url: str, data: dict, auth: tuple[str, str]) -> dict:
    import httpx

    with httpx.Client(timeout=15.0) as client:
        resp = client.post(url, data=data, auth=auth)
        resp.raise_for_status()
        return resp.json()


class TwilioProvider:
    """Real SMS + IVR via Twilio's REST API (form-encoded, HTTP basic auth)."""

    name = "twilio"

    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        sms_from: str,
        voice_from: Optional[str] = None,
        poster: Optional[Poster] = None,
    ) -> None:
        self.sid = account_sid
        self.token = auth_token
        self.sms_from = sms_from
        self.voice_from = voice_from or sms_from
        self._post = poster or _httpx_post

    def send(self, to: str, message: str) -> None:
        self._post(
            f"{_TWILIO_BASE}/Accounts/{self.sid}/Messages.json",
            {"To": to, "From": self.sms_from, "Body": message},
            (self.sid, self.token),
        )

    def call(self, to: str, message: str) -> None:
        # Read the same message aloud (TwiML <Say>) for non-literate recipients.
        twiml = f"<Response><Say>{message}</Say></Response>"
        self._post(
            f"{_TWILIO_BASE}/Accounts/{self.sid}/Calls.json",
            {"To": to, "From": self.voice_from, "Twiml": twiml},
            (self.sid, self.token),
        )


def make_provider(
    name: str,
    *,
    sid: str = "",
    token: str = "",
    sms_from: str = "",
    voice_from: str = "",
    poster: Optional[Poster] = None,
) -> SmsProvider:
    """Select a provider. Falls back to mock unless twilio is fully configured."""
    if name == "twilio" and sid and token and sms_from:
        return TwilioProvider(sid, token, sms_from, voice_from or None, poster=poster)
    return MockProvider()


_default: Optional[SmsProvider] = None


def get_provider() -> SmsProvider:
    """Return the configured provider (cached). Mock unless env selects twilio."""
    global _default
    if _default is None:
        from ..config import settings

        _default = make_provider(
            getattr(settings, "notify_provider", "mock"),
            sid=getattr(settings, "twilio_account_sid", ""),
            token=getattr(settings, "twilio_auth_token", ""),
            sms_from=getattr(settings, "twilio_from", ""),
            voice_from=getattr(settings, "twilio_voice_from", ""),
        )
    return _default
