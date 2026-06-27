"""F3 — Triage priority queue + ETA.

Deterministic, no training. Mines ``age_band``, ``status``, ``mobile``,
``reported_at`` (vulnerability) and historical ``resolution_hours`` (ETA) that the
base match engine ignores, so vulnerable cases jump the operator queue.
"""
