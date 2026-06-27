"""F1 — SMS/IVR notify-on-match.

When a match is confirmed, reach the family on the phone they registered (80% of
records carry one) — works on any feature phone, no smartphone or literacy
needed. The message carries the help-center name + a claim code, never the found
person's details, and the operator never sees the raw number (the system sends).
Localized per the case language; Claude writes it when reachable, else a bundled
template — the deterministic path never blocks on the cloud.
"""
