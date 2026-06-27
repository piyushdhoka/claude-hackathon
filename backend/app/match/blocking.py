"""Blocking: shrink the candidate pool from O(N) to a few dozen per query.

Candidate set = UNION of three cheap, recall-oriented blocks:
  1. (gender x age_band +-1 adjacent x geo-bucket)  — the structural block
  2. surname-exact                                   — catches name-only links
  3. mobile-exact (last 10 digits)                   — the strongest signal

Building each block is a dict lookup, so this stays O(N) to index and O(1) per
query lookup. We deliberately keep blocking *loose* (recall over precision) —
the weighted scorer + hard rules do the precise work afterwards.
"""
from __future__ import annotations

import math
from typing import Any, Iterable, Optional

from . import features as F

# Geo grid cell size in degrees. ~0.02 deg latitude ~= 2.2 km, which comfortably
# covers the geo decay (2 km) while keeping cells small. We also scan the 8
# neighboring cells so two nearby points never miss each other across a boundary.
_GEO_CELL_DEG = 0.02


def _geo_cell(lat: Optional[float], lng: Optional[float]) -> Optional[tuple[int, int]]:
    if lat is None or lng is None:
        return None
    return (int(math.floor(lat / _GEO_CELL_DEG)), int(math.floor(lng / _GEO_CELL_DEG)))


def _neighbor_cells(cell: tuple[int, int]) -> list[tuple[int, int]]:
    r, c = cell
    return [(r + dr, c + dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1)]


def _adjacent_bands(band: Optional[str], order: list[str]) -> list[str]:
    """The band plus its +-1 neighbors (by age_band_order). Unknown -> all."""
    idx = F.age_band_index(band, order)
    if idx is None:
        return list(order) + ["Unknown"]
    out = [order[idx]]
    if idx > 0:
        out.append(order[idx - 1])
    if idx < len(order) - 1:
        out.append(order[idx + 1])
    return out


class BlockingIndex:
    """In-memory inverted indexes over a pool, built once and reused per query."""

    def __init__(self, pool: list[dict[str, Any]], order: list[str]):
        self.pool = pool
        self.order = order
        self.by_id: dict[str, dict[str, Any]] = {}
        self._struct: dict[tuple[str, str, tuple[int, int]], list[str]] = {}
        self._by_surname: dict[str, list[str]] = {}
        self._by_mobile: dict[str, list[str]] = {}
        self._no_geo: list[str] = []  # cases lacking lat/lng still need a home
        self._build()

    def _build(self) -> None:
        for doc in self.pool:
            cid = doc.get("case_id")
            if not cid:
                continue
            self.by_id[cid] = doc
            g = F.normalize_gender(doc.get("gender"))
            band = doc.get("age_band")
            cell = _geo_cell(doc.get("lat"), doc.get("lng"))
            if cell is not None:
                self._struct.setdefault((g, band or "Unknown", cell), []).append(cid)
            else:
                self._no_geo.append(cid)
            sur = F.surname_of(doc.get("name"))
            if sur:
                self._by_surname.setdefault(sur, []).append(cid)
            mob = F.normalize_mobile(doc.get("mobile"))
            if mob:
                self._by_mobile.setdefault(mob, []).append(cid)

    def candidates(self, query: dict[str, Any]) -> set[str]:
        """Return candidate case_ids for a query via the UNION of all blocks."""
        out: set[str] = set()

        # --- structural block: gender x age_band(+-1) x geo-bucket(+-1 cell) ---
        qg = F.normalize_gender(query.get("gender"))
        # Unknown query gender must reach both male/female pools.
        genders = ["male", "female", "unknown"] if qg == "unknown" else [qg, "unknown"]
        bands = _adjacent_bands(query.get("age_band"), self.order)
        cell = _geo_cell(query.get("lat"), query.get("lng"))
        if cell is not None:
            cells = _neighbor_cells(cell)
            for g in genders:
                for b in bands:
                    for c in cells:
                        out.update(self._struct.get((g, b, c), ()))
            # geo-less cases can't be excluded purely on geometry -> include them
            out.update(self._no_geo)
        else:
            # query has no geo: fall back to all structural cells matching g x band
            for (g, b, _c), ids in self._struct.items():
                if g in genders and b in bands:
                    out.update(ids)
            out.update(self._no_geo)

        # --- surname-exact ---
        sur = F.surname_of(query.get("name"))
        if sur:
            out.update(self._by_surname.get(sur, ()))

        # --- mobile-exact ---
        mob = F.normalize_mobile(query.get("mobile"))
        if mob:
            out.update(self._by_mobile.get(mob, ()))

        return out

    def total_pairs(self) -> int:
        """All-pairs count for a single query against the pool (= pool size)."""
        return len(self.by_id)


def build_index(pool: Iterable[dict[str, Any]], order: list[str]) -> BlockingIndex:
    return BlockingIndex(list(pool), order)
