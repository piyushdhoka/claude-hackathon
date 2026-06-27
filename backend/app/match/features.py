"""Feature extraction + per-feature similarity scores for the match engine.

Every feature returns a float in [0, 1], or ``None`` when its inputs are absent
on either side. A ``None`` feature is dropped from BOTH the weighted numerator
and the denominator (available-case normalization) so an incomplete record is
never silently penalized to zero.

Normalization (names, mobiles, age bands) lives here too so blocking and scoring
share exactly one definition of "the same thing".
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import jellyfish
from rapidfuzz import fuzz

from ..config import REPO_ROOT

# ----------------------------------------------------------------------------
# Shared weights / rules — single source of truth (also read by the JS matcher).
# ----------------------------------------------------------------------------

_WEIGHTS_PATH = REPO_ROOT / "shared" / "match_weights.json"


@lru_cache(maxsize=1)
def load_weights(path: Optional[str] = None) -> dict[str, Any]:
    """Load shared/match_weights.json. Cached; pass a path to override (tests)."""
    p = Path(path) if path else _WEIGHTS_PATH
    with open(p, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ----------------------------------------------------------------------------
# Normalization
# ----------------------------------------------------------------------------

# Honorifics stripped from names before comparison. Lower-cased, dot-insensitive.
_HONORIFICS = {
    "shri", "sri", "smt", "smt.", "shrimati", "baba", "swami", "sant",
    "dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "shree", "kumari",
    "km", "master", "late", "pt", "pandit",
}

_NON_ALPHA = re.compile(r"[^a-z\s]")
_WS = re.compile(r"\s+")


def normalize_name(name: Optional[str]) -> Optional[str]:
    """Lowercase, strip honorifics + punctuation, collapse whitespace.

    Returns ``None`` for empty/blank names so downstream features drop out
    instead of comparing empty strings.
    """
    if not name or not name.strip():
        return None
    s = _NON_ALPHA.sub(" ", name.lower())
    tokens = [t for t in _WS.sub(" ", s).strip().split(" ") if t and t not in _HONORIFICS]
    if not tokens:
        return None
    return " ".join(tokens)


def split_name(name: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Return (given, surname) from a normalized name. Surname = last token."""
    norm = normalize_name(name)
    if not norm:
        return None, None
    parts = norm.split(" ")
    if len(parts) == 1:
        return parts[0], None
    return " ".join(parts[:-1]), parts[-1]


def surname_of(name: Optional[str]) -> Optional[str]:
    return split_name(name)[1]


def normalize_mobile(mobile: Optional[str]) -> Optional[str]:
    """Reduce to the last 10 digits (drops +91 / spaces / punctuation)."""
    if not mobile:
        return None
    digits = re.sub(r"\D", "", str(mobile))
    if len(digits) < 10:
        return None
    return digits[-10:]


def _norm_token(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip().lower()
    return s or None


def normalize_gender(g: Optional[str]) -> str:
    """Map free-form gender to {'male','female','unknown'}."""
    s = _norm_token(g)
    if not s:
        return "unknown"
    if s in ("m", "male", "man", "boy"):
        return "male"
    if s in ("f", "female", "woman", "girl"):
        return "female"
    return "unknown"


# ----------------------------------------------------------------------------
# Age band ordering helpers
# ----------------------------------------------------------------------------

def age_band_index(band: Optional[str], order: list[str]) -> Optional[int]:
    if not band:
        return None
    try:
        return order.index(band)
    except ValueError:
        return None


def age_band_distance(a: Optional[str], b: Optional[str], order: list[str]) -> Optional[int]:
    """Number of bands apart, or None if either band is unknown/unordered."""
    ia, ib = age_band_index(a, order), age_band_index(b, order)
    if ia is None or ib is None:
        return None
    return abs(ia - ib)


# ----------------------------------------------------------------------------
# Geo / time
# ----------------------------------------------------------------------------

_EARTH_KM = 6371.0088


def haversine_km(lat1, lng1, lat2, lng2) -> Optional[float]:
    if None in (lat1, lng1, lat2, lng2):
        return None
    r1, r2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_KM * math.asin(math.sqrt(a))


_TS_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})")


def parse_ts_hours(ts: Optional[str]) -> Optional[float]:
    """Parse 'YYYY-MM-DD HH:MM' to absolute hours (epoch-agnostic, for deltas)."""
    if not ts:
        return None
    m = _TS_RE.search(str(ts))
    if not m:
        return None
    y, mo, d, h, mi = (int(x) for x in m.groups())
    # days-since-civil (Howard Hinnant); good enough for hour deltas
    y2 = y - (1 if mo <= 2 else 0)
    era = (y2 if y2 >= 0 else y2 - 399) // 400
    yoe = y2 - era * 400
    doy = (153 * ((mo + 9) % 12) + 2) // 5 + d - 1
    doe = yoe * 365 + yoe // 4 - yoe // 100 + doy
    days = era * 146097 + doe - 719468
    return days * 24.0 + h + mi / 60.0


# ----------------------------------------------------------------------------
# Feature scores (each 0..1 or None when not computable)
# ----------------------------------------------------------------------------

def score_name_fuzzy(qn: Optional[str], cn: Optional[str]) -> Optional[float]:
    if qn is None or cn is None:
        return None
    # WRatio handles token order / partials; token_sort handles reordered names.
    wr = fuzz.WRatio(qn, cn)
    ts = fuzz.token_sort_ratio(qn, cn)
    return max(wr, ts) / 100.0


def _phonetic_codes(name: str) -> list[str]:
    return [jellyfish.metaphone(tok) for tok in name.split(" ") if tok]


def score_name_phonetic(qn: Optional[str], cn: Optional[str]) -> Optional[float]:
    if qn is None or cn is None:
        return None
    qc, cc = _phonetic_codes(qn), _phonetic_codes(cn)
    if not qc or not cc:
        return None
    # Token-set agreement on metaphone codes, backed up by match-rating compare.
    inter = len(set(qc) & set(cc))
    union = len(set(qc) | set(cc))
    code_overlap = inter / union if union else 0.0
    mr = 1.0 if jellyfish.match_rating_comparison(qn.replace(" ", ""),
                                                  cn.replace(" ", "")) else 0.0
    return max(code_overlap, 0.5 * mr + 0.5 * code_overlap)


def score_gender(qg: Optional[str], cg: Optional[str], rules: dict[str, Any]) -> Optional[float]:
    a, b = normalize_gender(qg), normalize_gender(cg)
    if a == "unknown" and b == "unknown":
        return None  # nothing to compare -> drop
    if a == "unknown" or b == "unknown":
        return rules.get("either_unknown", 0.5)
    return rules.get("same", 1.0) if a == b else rules.get("mismatch", 0.0)


def score_age_band(qb: Optional[str], cb: Optional[str], rules: dict[str, Any],
                   order: list[str]) -> Optional[float]:
    dist = age_band_distance(qb, cb, order)
    if dist is None:
        return None
    if dist == 0:
        return rules.get("same", 1.0)
    if dist == 1:
        return rules.get("adjacent", 0.6)
    return rules.get("else", 0.0)


def score_geo(qlat, qlng, clat, clng, rules: dict[str, Any]) -> Optional[float]:
    km = haversine_km(qlat, qlng, clat, clng)
    if km is None:
        return None
    decay = rules.get("decay_km", 2.0) or 2.0
    return math.exp(-km / decay)


def score_time(qts: Optional[str], cts: Optional[str], rules: dict[str, Any]) -> Optional[float]:
    qh, ch = parse_ts_hours(qts), parse_ts_hours(cts)
    if qh is None or ch is None:
        return None
    decay = rules.get("decay_hours", 48) or 48
    return math.exp(-abs(qh - ch) / decay)


def score_language(ql: Optional[str], cl: Optional[str]) -> Optional[float]:
    a, b = _norm_token(ql), _norm_token(cl)
    if a is None or b is None:
        return None
    return 1.0 if a == b else 0.0


def score_state_district(qs, qd, cs, cd, rules: dict[str, Any]) -> Optional[float]:
    qs, qd, cs, cd = (_norm_token(x) for x in (qs, qd, cs, cd))
    if qs is None and qd is None:
        return None
    if cs is None and cd is None:
        return None
    w_state = rules.get("same_state", 0.6)
    w_dist = rules.get("same_district", 0.4)
    score = 0.0
    have = 0.0
    if qs is not None and cs is not None:
        have += w_state
        if qs == cs:
            score += w_state
    if qd is not None and cd is not None:
        have += w_dist
        if qd == cd:
            score += w_dist
    if have == 0:
        return None
    return score / have  # renormalize over the parts we could actually compare


def score_description(qd: Optional[str], cd: Optional[str]) -> Optional[float]:
    a, b = _norm_token(qd), _norm_token(cd)
    if a is None or b is None:
        return None
    # token_set_ratio is robust to the short, templated, often-contradictory text.
    return fuzz.token_set_ratio(a, b) / 100.0


# ----------------------------------------------------------------------------
# Visual features (from Claude-vision photo analysis) + face biometrics
# ----------------------------------------------------------------------------

# Visual attribute fields compared between two cases. List fields use set
# overlap; scalar fields use exact (normalized) agreement.
_VISUAL_LIST_FIELDS = ("clothing_colors", "marks", "accessories")
_VISUAL_SCALAR_FIELDS = ("clothing_type", "build", "hair", "complexion",
                         "headwear", "footwear")


def _visual_tokens(attrs: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Pull comparable, normalized visual fields out of an Attributes dict."""
    if not isinstance(attrs, dict):
        return {}
    out: dict[str, Any] = {}
    for f in _VISUAL_LIST_FIELDS:
        vals = attrs.get(f) or []
        toks = {t for t in (_norm_token(v) for v in vals) if t}
        if toks:
            out[f] = toks
    for f in _VISUAL_SCALAR_FIELDS:
        t = _norm_token(attrs.get(f))
        if t:
            out[f] = t
    return out


def score_visual(qattrs: Optional[dict[str, Any]],
                 cattrs: Optional[dict[str, Any]]) -> Optional[float]:
    """Overlap of visual attributes (colours/clothing/marks/build/hair/...).

    Field-wise agreement averaged over only the fields present on BOTH sides
    (available-case within the feature). ``None`` when the two cases share no
    comparable visual field — so text-only cases never fire this feature.
    """
    q, c = _visual_tokens(qattrs), _visual_tokens(cattrs)
    shared = set(q) & set(c)
    if not shared:
        return None
    total = 0.0
    for f in shared:
        if f in _VISUAL_LIST_FIELDS:
            a, b = q[f], c[f]
            inter, union = len(a & b), len(a | b)
            total += (inter / union) if union else 0.0
        else:  # scalar
            total += 1.0 if q[f] == c[f] else 0.0
    return total / len(shared)


def score_face(qemb: Optional[list[float]],
               cemb: Optional[list[float]]) -> Optional[float]:
    """Cosine similarity of two face embeddings, mapped to [0, 1].

    ``None`` when either embedding is missing (the common case for text-only
    records), so available-case normalization drops the feature.
    """
    if not qemb or not cemb or len(qemb) != len(cemb):
        return None
    import numpy as np

    a = np.asarray(qemb, dtype="float32")
    b = np.asarray(cemb, dtype="float32")
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return None
    cos = float(np.dot(a, b) / (na * nb))
    # ArcFace cosine: same person typically >0.35, different ~0. Clamp negatives.
    return max(0.0, min(1.0, cos))
