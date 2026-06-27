# Setu — Living Feature Document

> **One registry, every center.** Offline-capable, multilingual, cross-center
> missing-persons reunification for the Nashik–Trimbakeshwar Simhastha Kumbh Mela 2027.
>
> _Maintained by the Documentation Monitor. Last refreshed: **2026-06-27**._
> _Status legend: ✅ done · 🟡 in progress / partial · ⬜ planned / stub._
>
> ⚠️ **Several build agents are working concurrently.** This document captures the
> repo as it stands right now and marks partial work honestly. Where a contract
> exists but the body is a `NotImplementedError`/UI stub, it is marked 🟡 or ⬜.

---

## 1. Project overview

**The problem.** Over 80 million pilgrims attend the Kumbh Mela. At that scale,
thousands of people — overwhelmingly **elderly** pilgrims — are separated from
their families every day. Today each lost-and-found center keeps its own paper/manual
list, and **there is no cross-search between centers**: a found person registered at
Center A is invisible to a family searching at Center B. Four compounding realities
make this hard:

- **The cross-center gap** is the core failure — the highest-impact thing to fix.
- The at-risk group is **phoneless and often non-literate** (elderly, rural,
  multilingual). You cannot assume a smartphone or typing.
- **Networks die on snan (Amrit Snan) days** near the ghats exactly when case
  volume spikes 4–5×. The tool must work fully offline.
- **Privacy by design** — contact PII and biometrics must be protected, revealed
  only on confirmation, and purged after reunion.

**The one-line solution.** A single event-sourced registry shared by every center,
driven by a deterministic, explainable, fully-offline match engine, fronted by a
tap-only multilingual PWA for phoneless pilgrims — with Claude, face, and voice as
optional enrichment that nothing critical depends on.

---

## 2. Architecture

Two halves over one shared contract layer.

```
claude/
├─ data/                CSVs + KMLs (synthetic 2500 cases, CCTV, police, chokepoints)
├─ shared/              SOURCE-OF-TRUTH contracts consumed by BOTH halves
│   ├─ match_weights.json    weights, sub-scores, hard rules, thresholds, age order
│   ├─ wizard_vocab.json     tap vocabulary (10 languages, who/colors/marks/places)
│   └─ location_coords.json  the 20 last_seen_location → lat/lng (geocoded)
├─ backend/   FastAPI + uv  (uv run uvicorn app.main:app --port 8000)
└─ frontend/  Next.js 16 + React 19 PWA  (npm run dev)
```

### The two halves
- **Frontend — Next.js 16 PWA** (React 19, Tailwind v4, Zustand, Dexie, Leaflet,
  Serwist). Operator-driven, tap-only, multilingual, installable, offline-first.
  ⚠️ This is a **breaking** Next.js 16 (see `frontend/AGENTS.md`) — agents must read
  `node_modules/next/dist/docs/` before writing route code.
- **Backend — FastAPI on uv** (Python ≥3.12). SQLite event store + projection,
  the deterministic match engine, KML→GeoJSON geo ETL, and the Claude enrichment
  layer. Anthropic models default to **Opus 4.8**.

### Event-sourced registry
The **append-only `events` table is the source of truth and the audit trail**; the
`cases` table is a materialized projection rebuilt by folding events
(`backend/app/registry/store.py`, `backend/app/db.py`). Every event carries a
**client-generated UUID**, so `POST /registry/events` is **idempotent** — the PWA
outbox can replay safely after reconnect with no duplicates.

### One entity, three jobs
A `Case` has `case_type ∈ {missing, found}`. The same engine does:
1. **Reunion** — match a `found` person against the `missing` pool.
2. **Duplicate detection** — match `missing` ↔ `missing` across centers (the 8%).

### Offline-first rule (the spine)
> The **deterministic match engine is the source of truth and runs fully offline.**
> **Claude (Opus 4.8), face-match, and voice are enrichment layers that nothing
> critical depends on.** Every enrichment function degrades to a safe default
> (no-op / English / empty) on any failure — offline, missing key, API error, or
> refusal — and never raises into the hot path.

---

## 3. Feature inventory

### 3.1 Registry & sync
| Feature | Status | Where | Notes |
|---|---|---|---|
| Append-only event log (`events`) | ✅ | `registry/store.py`, `db.py` | Source of truth + audit; WAL SQLite |
| Case projection (fold events → `cases`) | ✅ | `store.py:_fold/_upsert_case` | Denormalized cols for fast blocking |
| Idempotent bulk ingest `POST /registry/events` | ✅ | `registry/router.py` | De-dupes on `event_id`; returns received/applied |
| PII masking (mobile → `+91 ••••••1234`) | ✅ | `store.py:mask_mobile/mask_case` | Default-masked; revealed only with `X-Role: supervisor` |
| Biometric vector never shipped to clients | ✅ | `store.py:mask_case` | `face_embedding` dropped from all API views |
| Audit trail `GET /cases/{id}/audit` | ✅ | `registry/router.py` | The event log IS the audit trail |
| Cases list/detail + filters | ✅ | `registry/router.py` | `case_type`, `status`, `limit≤1000`, `offset` |
| Seed 2,500 missing cases from CSV | ✅ | `registry/seed.py` | Idempotent; only seeds an empty registry |
| Stats `GET /registry/stats`, `GET /health` | ✅ | `router.py`, `main.py` | Health reports Claude-key + face flag |
| Event types (created/attr/status/match/dup/consent/reunited/purged…) | ✅ | `store.py` constants | 11 typed events folded into the projection |

### 3.2 Match engine (deterministic, offline, explainable)
| Feature | Status | Where | Notes |
|---|---|---|---|
| `find_matches(query, case_type, top_k)` contract | ✅ | `match/engine.py` | Stable signature other modules depend on |
| Blocking (3-block union) | ✅ | `match/blocking.py` | gender × age±1 × geo-cell, **∪** surname-exact, **∪** mobile-exact |
| Per-feature similarity scores (each 0..1 or `None`) | ✅ | `match/features.py` | name fuzzy + phonetic, gender, age, geo, time, language, state/district, description |
| Name normalization (honorifics, phonetic) | ✅ | `features.py` | rapidfuzz WRatio/token-sort + jellyfish metaphone/MRC |
| Weighted fusion → 0..100 + `contributions` | ✅ | `match/fusion.py:fuse` | Contributions sum to the headline score (for the UI bars) |
| **Available-case normalization** | ✅ | `fusion.py` | Absent features dropped from numerator **and** denominator — incomplete records never penalized to zero |
| Hard rules (mobile-exact floor 92; gender+age cap 25) | ✅ | `fusion.py:apply_hard_rules` | Deterministic floors/caps from `match_weights.json` |
| `POST /match` (cross-center reunion) | ✅ | `match/router.py` | top_k≤25 |
| `POST /match/dedupe` (duplicate detection) | ✅ | `match/router.py` | Same type, excludes same reporting center |
| Self-match exclusion (query's own `case_id`) | ✅ | `engine.py` | Dedupe never self-matches |
| Injectable pool for eval/tests | ✅ | `engine.py:find_matches(pool=…)` | For semi-synthetic injected-pair evaluation |
| Unit/eval tests | ⬜ | `backend/tests/` | Package exists; no test modules yet |

### 3.3 Visual features (photo → attributes / biometric)
| Feature | Status | Where | Notes |
|---|---|---|---|
| Visual attribute fields on the model | ✅ | `models.py:Attributes` | build, hair, complexion, headwear, footwear, accessories, visual_quality, source |
| `visual_description` field (localized) | ✅ | `models.py:Case` | Reserved for Claude-vision natural-language output |
| Claude-vision photo analysis (`analyze_image`) | ⬜ | `enrich/vision.py` | **Contract stub** — raises `NotImplementedError`; router returns `{analyzed:false}` |
| `POST /enrich/vision` endpoint | 🟡 | `enrich/router.py` | Wired + degrades gracefully, but backed by the stub |
| `analyzeVision()` client | ✅ | `frontend/src/lib/api.ts` | Returns `{analyzed, visual_description, attributes, contradicts_structured}` |
| Visual sub-score in weights (`visual` 0.07) | ✅ | `shared/match_weights.json` | Defined; absent until a photo exists (available-case) |
| Face embedding field + biometric match | ⬜ | `models.py`, `face/router.py` | `face_embedding` stored, never shipped; embedding pipeline not built |
| Face sub-score in weights (`face` 0.10) | ✅ | `shared/match_weights.json` | Defined; absent until embeddings exist |
| `POST /face/search` (1:N biometric) | ⬜ | `face/router.py` | Feature-flagged **off**; 503 when disabled, 501 when enabled-but-unimplemented |

> Note: the `visual` and `face` weights are intentionally **dropped via available-case
> normalization** until a photo/embedding is captured, so text-only cases are never
> penalized for lacking them.

### 3.4 Claude enrichment (Opus 4.8 — optional, degrades to no-op)
| Feature | Status | Where | Notes |
|---|---|---|---|
| `extract_attributes` (strict tool-use JSON) | ✅ | `enrich/claude.py` + `prompts.py` | Flags description↔structured contradictions; captures mobility/confusion cues; prompt-cached prefix |
| `explain_match` (faithful localized rationale) | ✅ | `enrich/claude.py` | Score is **input**; never invents a number or fact; leads with top contributions; native-script output |
| `translate` (batch, key-preserving) | ✅ | `enrich/claude.py` | 10 languages; schema-enforced key preservation; falls back to source on miss |
| Safe-default degradation on any failure | ✅ | `enrich/claude.py` | Offline/missing-key/API-error/refusal → default; never raises |
| In-memory hash caches | ✅ | `enrich/claude.py` | extract/explain/translate caches keyed by input hash |
| Adaptive thinking + strict tools + prompt caching | ✅ | `enrich/claude.py` | `thinking={"type":"adaptive"}`, `strict=True`, `cache_control` on stable prefix |
| Endpoints `/enrich/{status,attributes,explain,translate,vision}` | ✅ | `enrich/router.py` | All present; vision backed by stub (see 3.3) |
| PII scrubbed from records sent to Claude | ✅ | `claude.py:_safe_fields` | Drops mobile/phone/contact before explain |

### 3.5 Geography (KML → GeoJSON ETL + spatial analytics)
| Feature | Status | Where | Notes |
|---|---|---|---|
| KML parsing (stdlib `xml.etree`, no lxml) | ✅ | `geo/etl.py` | Parses 3 KMLs once per process, cached |
| **32 zone polygons** → `zones.json` | ✅ | `geo/etl.py` | Verified: 32 features, with per-zone camera_count + centroid |
| **~4,079 CCTV cameras** → `cameras.json` | ✅ | `geo/etl.py` | Verified: 4,079 features; classified by series; zone-assigned |
| **~21 named landmarks** → `landmarks.json` | ✅ | `geo/etl.py` | Verified: 21 features (ghat/landmark polygons → centroid points) |
| **85 chokepoints/parking** → `chokepoints.json` | ✅ | `geo/etl.py` | Verified: 85 features with category/risk/note |
| **14 police stations** → `police.json` | ✅ | `geo/etl.py` | Verified: 14 features |
| Point-in-polygon zone assignment | ✅ | `geo/etl.py:point_in_ring/assign_zone` | Ray casting (shapely reserved for service.py) |
| Geocoding the 20 `last_seen_location` values | ✅ | `shared/location_coords.json` | All 20 mapped to lat/lng with match score + source; all 2,500 cases geocoded in DB |
| `geocode()` runtime service | ⬜ | `geo/service.py` | **Contract stub** — `NotImplementedError`; `/geo/geocode` returns 501 |
| Separation hotspots `hotspots()` | ⬜ | `geo/service.py` | Stub; `/geo/hotspots` → 501 |
| Kiosk-placement recommendations `kiosk_recommendations()` | ⬜ | `geo/service.py` | Stub (high-risk ∩ low-coverage); `/geo/kiosks` → 501 |
| `build_geojson()` runtime entry | 🟡 | `geo/service.py` | Stub, but `etl.write_geojson_files()` already produces all 5 files |

> **Status nuance:** the **ETL is done and the 5 GeoJSON files exist in
> `frontend/public/geo/`** (the map can already load layers). The analytic
> `service.py` layer (live geocode / hotspots / kiosks) is still a stub.

### 3.6 Phoneless multilingual UX (tap-only intake)
| Feature | Status | Where | Notes |
|---|---|---|---|
| Tap vocabulary contract (10 languages) | ✅ | `shared/wizard_vocab.json`, `data/` copy | who/age/colors/clothing/marks/flags/places/centers |
| Typed vocab accessor | ✅ | `components/common/vocab.ts` | langName, colorByKey, flagLabel helpers |
| Pictographic silhouettes (non-literate "who is lost") | ✅ | `components/common/Silhouette.tsx` | Hand-built SVGs: elder man/woman, man/woman, boy/girl, unsure |
| Glyph set | ✅ | `components/common/glyphs.tsx` | Present |
| Large-target tap UI primitives | ✅ | `components/common/ui.tsx` | `TapCard` etc., big tap zones, photo/icon-first |
| Voice read-back (SpeechSynthesis) | ✅ | `components/common/useSpeech.ts` | BCP-47 map; Maithili/Bhojpuri/Awadhi fall back to Hindi voice; slower rate for elderly |
| Optimistic i18n (Claude translate + cache) | ✅ | `components/common/useI18n.ts` | Renders English instantly, swaps in translation; never blocks on network |
| **Intake wizard page** (tap-only, voice-guided) | ⬜ | `app/intake/page.tsx` | **Stub** — "coming up" placeholder |
| **Search & Match review page** | ⬜ | `app/review/page.tsx` | **Stub** — ranked candidates + "why" not built |
| **Supervisor console** (confirm/reveal/audit) | ⬜ | `app/supervisor/page.tsx` | **Stub** |
| Photo capture in wizard | ⬜ | (wizard) | Planned (feeds vision/face) |
| Home dashboard + Nav (role/center/online) | ✅ | `app/page.tsx`, `components/Nav.tsx` | 4 tiles; demo network + role toggles |

### 3.7 Offline-first (PWA + Dexie + outbox)
| Feature | Status | Where | Notes |
|---|---|---|---|
| Dexie/IndexedDB schema (`cases` mirror + `outbox`) | ✅ | `lib/offline/db.ts` | Lazy singleton; SSR-safe |
| Optimistic write to local mirror | ✅ | `lib/offline/sync.ts:enqueueEvents` | UI updates immediately |
| Append-only outbox + idempotent flush | ✅ | `lib/offline/sync.ts:flushOutbox` | Batched POST; only confirmed items removed; attempts/last_error tracked |
| Pull/mirror reads (browse registry offline) | ✅ | `lib/offline/sync.ts:pullCases/readMirroredCases` | Best-effort; falls back to mirror |
| Sync-status store (pending/syncing/error) | ✅ | `lib/offline/sync.ts:useSyncStatus` | Zustand store for pending badge |
| **Wire offline path into write flow** | 🟡 | `lib/cases.ts` | `submitEvents()` is still the **online-first stub** (posts straight to network); offline engine exists but `cases.ts` not yet switched over |
| Background-sync trigger hook (on reconnect) | ⬜ | (hooks) | Referenced in comments; hook file not present |
| PWA manifest | ✅ | `public/manifest.webmanifest` | Standalone, themed |
| Serwist service worker wiring | ⬜ | `next.config.ts` | `@serwist/next` installed; `withSerwist(...)` not yet wired |
| QR case token | ⬜ | (wizard) | `qrcode.react` installed; not yet used |
| Demo "snan-day" offline toggle | ✅ | `components/Nav.tsx`, `store/app.ts` | Simulates network loss |

### 3.8 Responsible data handling
| Feature | Status | Where | Notes |
|---|---|---|---|
| Mask mobile until confirmed/authorized | ✅ | `store.py:mask_case` | Revealed only with `X-Role: supervisor` |
| Roles (operator / supervisor) | ✅ | `registry/router.py`, `store/app.ts`, `api.ts` | `X-Role` header end-to-end |
| Audit trail (every event timestamped + actor) | ✅ | `store.py:get_audit_trail` | Immutable event log |
| Consent capture (`consent.captured` event) | ✅ | `models.py`, `store.py` | Folds into `consent` flag |
| Auto-purge on reunion (`case.purged`) | ✅ | `store.py:_fold` | Drops name/mobile/photo/embedding/description; keeps anonymized shell, sets `purged` |
| Never ship biometric vector | ✅ | `store.py:mask_case` | `face_embedding` stripped from all responses |
| PII scrubbed before Claude calls | ✅ | `claude.py:_safe_fields` | Rationale narrates features, not contacts |
| `pii.revealed` audit event | 🟡 | `store.py` constant defined | Constant exists; reveal-logging in supervisor UI not built |

---

## 4. Tech stack & key dependencies

### Backend (`backend/pyproject.toml`, Python ≥3.12, uv)
| Package | Version | Role |
|---|---|---|
| fastapi | ≥0.138.1 | API framework |
| uvicorn[standard] | ≥0.49.0 | ASGI server |
| pydantic | ≥2.13.4 | Models |
| pydantic-settings | ≥2.14.2 | `.env` config |
| anthropic | ≥0.112.0 | Claude (Opus 4.8) enrichment |
| rapidfuzz | ≥3.14.5 | Fuzzy name scoring |
| jellyfish | ≥1.2.1 | Phonetic (metaphone / match-rating) |
| shapely | ≥2.1.2 | Geometry (reserved for geo service) |
| numpy | ≥2.5.0 | Numerics |
| pandas | ≥3.0.3 | CSV / data work |
| scikit-learn | ≥1.9.0 | (embeddings / similarity, reserved) |
| python-multipart | ≥0.0.32 | File/photo uploads |
| python-dotenv | ≥1.2.2 | Env loading |
| **Storage** | SQLite (WAL) | `backend/setu.db` |

**Claude models (`backend/app/config.py`):** extract / explain / translate default to
`claude-opus-4-8`; `claude-haiku-4-5` is the fast fallback. `FACE_MATCH_ENABLED=false`.

### Frontend (`frontend/package.json`)
| Package | Version | Role |
|---|---|---|
| next | 16.2.9 | App framework (⚠️ breaking Next 16) |
| react / react-dom | 19.2.4 | UI |
| tailwindcss | ^4 | Styling |
| zustand | ^5.0.14 | State (app + sync status) |
| dexie | ^4.4.4 | IndexedDB offline mirror + outbox |
| leaflet / react-leaflet | ^1.9.4 / ^5.0.0 | Hotspot map |
| serwist / @serwist/next | ^9.5.11 | PWA service worker (not yet wired) |
| qrcode.react | ^4.2.0 | QR case token (not yet used) |
| lucide-react | ^1.21.0 | Icons |
| clsx | ^2.1.1 | Classnames |

---

## 5. Data facts (measured from the dataset, 2026-06-27)

Measured from `data/Synthetic_Missing_Persons_2500.csv` and the seeded DB:

- **2,500** synthetic missing-person records (no real PII). Seeded → **2,500 cases /
  2,500 events**, **all 2,500 geocoded** (lat/lng backfilled).
- **Elderly-dominant:** the **61–70 band is the largest (697)**, then 71–80 (532),
  41–60 (506); 80+ (225). 58%+ are 61 or older.
- **15% have no name** (measured **14.8%**, 371 rows).
- **20% have no mobile** (measured **19.7%**, 492 rows).
- **8% duplicate reports across centers** (measured **8.1%**, 202 rows) — the core
  matching problem. ⚠️ `is_duplicate_report` has **no partner record**, so evaluate
  matching with **semi-synthetic injected pairs** and use the flag only as a sanity check.
- **Names are romanized Latin** from a tiny pool — no Indic-script transliteration
  needed for matching.
- **`last_seen_location` is a clean 20-value vocabulary** — all 20 geocoded in
  `shared/location_coords.json`.
- **`physical_description` is ~24 templates, often contradictory** (e.g. a `Male`
  row described as "woman in green saree") — which is exactly why `extract_attributes`
  surfaces `contradicts_structured`.
- **Status mix:** Reunited 2,150 · Pending 210 · Transferred to hospital 73 ·
  Unresolved 67 (~86% resolved).
- Cases spike **4–5× on Amrit Snan days** (per dataset notes) — the offline driver.

**Geography (from KML ETL, verified in `frontend/public/geo/`):**
32 zone polygons · **4,079** CCTV cameras · 21 named landmarks · 85 chokepoints/parking ·
14 police stations.

---

## 6. How to run

**Backend** (seeds 2,500 cases on first start; idempotent):
```bash
cd backend
uv run uvicorn app.main:app --port 8000
# health: http://127.0.0.1:8000/health
```
Requires `ANTHROPIC_API_KEY` in the repo-root `.env` for Claude enrichment
(everything else works without it). Regenerate GeoJSON layers with
`uv run python -m app.geo.etl`.

**Frontend:**
```bash
cd frontend
npm run dev
# http://localhost:3000   (set NEXT_PUBLIC_API_URL if backend isn't on :8000)
```

---

## 7. Demo hero flow

1. A family reports a lost elder at **Center A** — tap-only, offline (wizard).
2. A volunteer registers a found elder at **Center B**.
3. The deterministic engine flashes a **high-confidence cross-center match** with
   per-feature `contributions` and a **Claude-written localized "why".**
4. A **supervisor confirms** → masked mobile is **revealed**.
5. `case.reunited` is emitted → **PII auto-purged.**
6. The **hotspot map** then shows where to place the next kiosk.

**Hero-flow readiness (current):** backend match + registry + masking + reunite/purge
are ✅; the wizard / review / supervisor / map **UI pages are still stubs** (⬜), and
geo hotspots/kiosks (`service.py`) are stubs, so steps 1–2, 4 (UI) and 6 are not yet
demoable end-to-end through the UI. The backend can already perform steps 3–5 via the
API.

---

## 8. Roadmap / known gaps

**In progress / next up (🟡):**
- Wire the offline write path: switch `lib/cases.ts:submitEvents` from the online-first
  stub to the Dexie outbox engine in `lib/offline/sync.ts`.
- `geo/service.py`: implement `geocode`, `hotspots`, `kiosk_recommendations`,
  `build_geojson` (ETL + `location_coords.json` already provide the inputs).

**Planned (⬜):**
- **Intake wizard** (`app/intake`): tap-only, multilingual, voice-guided, photo capture.
- **Search & Match review** (`app/review`): ranked candidates, contribution bars,
  Claude rationale, confirm flow.
- **Supervisor console** (`app/supervisor`): confirm match, reveal PII (+`pii.revealed`
  audit), duplicate review, audit-trail view.
- **Hotspot map** (`app/map`): Leaflet zone/coverage/heat layers + kiosk gaps.
- **Claude vision** (`enrich/vision.py`): photo → localized visual description + attributes.
- **Face biometric** (`face/router.py`): embedding pipeline + 1:N search (flag off).
- **PWA service worker:** wire `withSerwist(...)` in `next.config.ts`; reconnect
  background-sync hook; **QR case token** (`qrcode.react`).
- **Tests/eval:** match-engine unit tests + semi-synthetic injected-pair evaluation
  (`backend/tests/` is empty).

**Known caveats:**
- `is_duplicate_report` has no partner record → do not score against the raw flag.
- Maithili/Bhojpuri/Awadhi have no browser TTS voice → fall back to the Hindi voice.
- CORS is wide-open (`allow_origins=["*"]`) for the demo — tighten for deployment.

---

### Status tally (this revision)
- ✅ **done:** 58
- 🟡 **in progress / partial:** 6
- ⬜ **planned / stub:** 19

_Counts cover the inventory tables in §3 plus the visual/face endpoint rows._
