"""Evaluate the match engine on SEMI-SYNTHETIC injected pairs.

Why semi-synthetic: the dataset's `is_duplicate_report` flag marks a row as a
duplicate but provides NO partner record (mobiles never repeat; same-name peers
have inconsistent attributes), so it can't serve as a pairwise ground truth. We
therefore clone real cases into realistic "second sightings" (the way a person
reported at Center A would look when found/reported at Center B), measure how
well the engine reunites clone <-> original, and report the blocking reduction.

Run:  uv run python -m app.match.eval
"""
from __future__ import annotations

import datetime as _dt
import random
import time

from ..registry import store
from . import engine

# Realistic cross-center perturbations applied to a clone (a second sighting).
_NEIGHBOR_LOC = {
    "Ramkund Ghat": "Panchavati Circle", "Sadhugram Gate 2": "Sadhugram Gate 1",
    "Nashik Road Station": "Bus Stand Nashik", "Kushavart Kund": "Ramkund Ghat",
    "Takli Sangam": "Kapila Sangam", "Trimbakeshwar Approach": "Trimbak Road",
}
_AGE_ORDER = ["0-12", "13-17", "18-40", "41-60", "61-70", "71-80", "80+"]


def _spelling_variant(name: str) -> str:
    if not name:
        return name
    subs = [("ee", "i"), ("aa", "a"), ("v", "w"), ("sh", "s"), ("ph", "f")]
    for a, b in subs:
        if a in name.lower():
            return name.lower().replace(a, b, 1).title()
    return name[:-1] if len(name) > 4 else name


def _clone(case: dict, rng: random.Random) -> dict:
    """Make a realistic 'second sighting' of `case` (a found-at-another-center view)."""
    c = dict(case)
    c["case_id"] = "CLONE-" + case["case_id"]
    c["reporting_center"] = "Ramkund Kho-Ya-Paya Kendra"  # a different center
    # Second sighting happens LATER — shift the report time by 2..30 hours so the
    # original gets no unfair exact-timestamp advantage (avoids a time leak).
    try:
        base = _dt.datetime.strptime(case["reported_at"][:16], "%Y-%m-%d %H:%M")
        shifted = base + _dt.timedelta(hours=rng.uniform(2, 30))
        c["reported_at"] = shifted.strftime("%Y-%m-%d %H:%M")
    except Exception:
        pass
    # ~20%: age band drifts by one (family/operator estimate noise)
    if rng.random() < 0.2:
        i = _AGE_ORDER.index(c["age_band"]) if c.get("age_band") in _AGE_ORDER else None
        if i is not None:
            j = max(0, min(len(_AGE_ORDER) - 1, i + rng.choice([-1, 1])))
            c["age_band"] = _AGE_ORDER[j]
    # neighboring last-seen location (re-geocode via the same canonical coords)
    if rng.random() < 0.5 and c.get("last_seen_location") in _NEIGHBOR_LOC:
        c["last_seen_location"] = _NEIGHBOR_LOC[c["last_seen_location"]]
    # blank the name ~15% / mobile ~20% (the phoneless reality)
    if rng.random() < 0.15:
        c["name"] = None
    if rng.random() < 0.20:
        c["mobile"] = None
    # spelling variant of a present name ~30%
    if c.get("name") and rng.random() < 0.30:
        c["name"] = _spelling_variant(c["name"])
    # a second sighting is described in the new operator's OWN words: blank the
    # copied description ~55%, otherwise keep it (some operators describe alike).
    if rng.random() < 0.55:
        c["description"] = None
    # A FOUND confused elder's ORIGIN is usually unknown to the finding operator,
    # so a realistic found-report drops home state/district (~70%) and sometimes
    # language (~30%). This removes the origin "fingerprint" and tests the hard
    # case: matching on geo + age + gender + (maybe) name alone.
    if rng.random() < 0.70:
        c["state"] = None
    if rng.random() < 0.70:
        c["district"] = None
    if rng.random() < 0.30:
        c["language"] = None
    return c


def run(n: int = 200, seed: int = 7) -> dict:
    from . import blocking, features as F

    rng = random.Random(seed)
    pool = [c for c in store.iter_cases("missing")]
    sample = rng.sample(pool, min(n, len(pool)))

    order = F.load_weights()["age_band_order"]
    index = blocking.build_index(pool, order)  # the real blocking index over the pool

    all_pairs = len(pool) * (len(pool) - 1) // 2

    hit1 = hit5 = 0
    cand_total = 0  # true blocked candidates (before top-k), for the reduction ratio
    t0 = time.time()
    for original in sample:
        clone = _clone(original, rng)
        cand_total += len(index.candidates(clone))
        res = engine.find_matches(clone, case_type="missing", top_k=5)
        ids = [r.case_id for r in res]
        if ids and ids[0] == original["case_id"]:
            hit1 += 1
        if original["case_id"] in ids:
            hit5 += 1
    dt = time.time() - t0

    avg_cand = cand_total / len(sample)
    return {
        "queries": len(sample),
        "pool": len(pool),
        "recall@1": round(hit1 / len(sample), 3),
        "recall@5": round(hit5 / len(sample), 3),
        "avg_blocked_candidates": round(avg_cand, 1),
        "all_pairs_if_bruteforce": all_pairs,
        "blocking_reduction_vs_pool": f"{round(100 * (1 - avg_cand / len(pool)), 2)}%",
        "avg_query_ms": round(1000 * dt / len(sample), 1),
    }


if __name__ == "__main__":
    import json
    print(json.dumps(run(), indent=2))
