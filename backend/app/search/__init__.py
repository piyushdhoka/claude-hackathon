"""F4 — Family self-search.

The brief's core scenario: a family searching at a different center. They
describe their lost person with the same tap-only primitives the intake wizard
uses; we run that partial description through the existing match engine against
the pool of *found* people and return masked, ranked candidates. Reversed match
direction, same engine — no new scoring.
"""
