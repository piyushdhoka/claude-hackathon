# Setu — Architecture & Module Contracts

**One registry, every center.** Offline-capable, multilingual, cross-center
missing-persons reunification for Kumbh Mela 2027. Built for phoneless,
non-literate, mostly-elderly pilgrims.
Vmatch engine is the source of truth and runs
> fully offline**. Claude (Opus 4.8), face-match, and voice are **enrichment
> layers that nothing critical depends on**. Networks die on snan days.

## Layout

```
claude/
├─ data/                 CSVs (Synthetic_Missing_Persons_2500.csv + 4 geo CSVs)
├─ *.kml                 CCTV Dataset.kml (32 zone POLYGONS + ~4079 cameras +
│                        ~22 named landmarks), Police Stations.kml, chokepoints.kml
├─ shared/               source-of-truth contracts (consumed by BOTH halves)
│   ├─ match_weights.json
│   ├─ wizard_vocab.json
│   └─ location_coords.json   (the 20 last_seen_location -> lat/lng)
├─ backend/   (uv; `uv run uvicorn app.main:app --port 8000`)
│   └─ app/
│       ├─ config.py    settings (.env: ANTHROPIC_API_KEY; models = Opus 4.8)
│       ├─ models.py    Case (case_type missing|found), Event, MatchCandidate
│       ├─ db.py        SQLite: append-only events -> projected cases
│       ├─ registry/    store.py (events, projection, PII mask, audit) + seed.py + router.py
│       ├─ match/       engine.py + router.py        ← AGENT A
│       ├─ geo/         service.py + router.py        ← AGENT B
│       ├─ enrich/      claude.py + router.py         ← AGENT C
│       └─ face/        router.py (flagged off)       ← stretch
└─ frontend/  (Next.js 16 + React 19, `npm run dev`)
    └─ src/
        ├─ lib/         api.ts, types.ts, cases.ts (FROZEN — shared)
        ├─ store/app.ts role/center/language/online (FROZEN — shared)
        ├─ data/*.json  copies of shared contracts
        ├─ components/Nav.tsx, app/layout.tsx, globals.css (FROZEN — shared)
        └─ app/intake|review|supervisor  ← AGENT D    app/map ← AGENT E
```

## Data model (one entity, three jobs)
A `Case` has `case_type ∈ {missing, found}`. Matching missing↔found = reunion;
matching missing↔missing across centers = the 8% duplicate. Same engine, both jobs.
The **event log is the source of truth and the audit trail**; `cases` is a projection.

## Backend status (DONE — foundation)
- Registry seeded with **2,500 missing cases**, each geocoded (lat/lng backfilled).
- PII masking (`mobile` → `+91 ••••••1234`) unless `X-Role: supervisor`.
- Endpoints live: `/health`, `/registry/{events,cases,cases/{id},cases/{id}/audit,stats}`.
- Stubs return clean 501 until agents implement: `/match`, `/match/dedupe`, `/geo/*`,
  `/enrich/*`, `/face/*`.

## Key data facts (measured)
- Elderly-dominant (58% are 61+). Names are **romanized Latin** from a tiny pool
  (no Indic-script transliteration needed for matching). `last_seen_location` is a
  clean 20-value vocabulary. `physical_description` is ~24 templates, often
  **contradictory** (a "Male" row described as "woman in green saree"). 15% no name,
  20% no mobile. `is_duplicate_report` has **no partner record** → evaluate matching
  with **semi-synthetic injected pairs**, use the flag only as a sanity check.

## Module contracts (see the STUB docstrings for full detail)
- **match.engine.find_matches(query, case_type, top_k)** → ranked `MatchCandidate`
  with `score` 0–100 + per-feature `contributions`. Blocking → weighted score (weights
  from `shared/match_weights.json`) → available-case normalization → hard rules.
- **geo.service**: `geocode`, `hotspots`, `kiosk_recommendations`, `build_geojson`
  (writes `frontend/public/geo/*.json`).
- **enrich.claude** (Opus 4.8, degrades to no-op offline): `extract_attributes`,
  `explain_match` (faithful, never invents a score), `translate` (10 languages).

## Demo hero flow
Family reports lost elder at Center A (tap-only, offline) → volunteer registers a
found elder at Center B → engine flashes a high-confidence cross-center match with a
Claude-written localized "why" → supervisor confirms → masked mobile revealed →
`case.reunited` → PII purged. Then the map shows where to place the next kiosk.
