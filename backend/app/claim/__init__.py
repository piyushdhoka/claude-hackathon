"""F6 — Claim-fraud guard.

The real Kho-Ya-Paya portal enabled extortion via wrongful claims. This guard
runs at the claim/reveal step, BEFORE any PII is revealed or a notify fires. It
scores deterministic fraud signals — one claimant against many children,
answers that contradict the case, a history of rejected attempts — and blocks
auto-reveal for anything non-clean, routing it to a supervisor. Minors always
require guardian consent (DPDP §9). Decisions are written to the audit trail as
claim.flagged / claim.cleared.
"""
