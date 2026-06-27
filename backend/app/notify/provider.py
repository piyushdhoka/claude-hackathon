"""Notify channel abstraction.

The deterministic core depends only on this interface. The demo uses an
in-memory/console ``MockProvider``; a real SMS/IVR gateway (Twilio, MSG91) would
implement the same ``send`` and be selected behind an env flag — nothing else
changes.
"""
from __future__ import annotations

from typing import Protocol


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
        self.sent.append({"to": to, "message": message})
        print(f"[notify:mock] -> {to}: {message}")


_default = MockProvider()


def get_provider() -> SmsProvider:
    """Return the configured provider. Mock by default (offline-safe demo)."""
    return _default
