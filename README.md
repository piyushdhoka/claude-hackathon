# Setu — One Registry, Every Center

> A cross-center, offline-capable missing-persons reunification platform for the
> Nashik–Trimbakeshwar Simhastha Kumbh Mela 2027.

**Setu** (Sanskrit: *bridge*) connects every lost-and-found center into a single
shared registry. The moment any person is registered at any center, a
deterministic match engine checks them against every open case at every other
center — and keeps working when the network does not.

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Problem → Solution, Point by Point](#2-problem--solution-point-by-point)
3. [Architecture at a Glance](#3-architecture-at-a-glance)
4. [Features, One by One](#4-features-one-by-one)
5. [Tech Stack](#5-tech-stack)
6. [Project Structure](#6-project-structure)
7. [Setup Guide](#7-setup-guide)
8. [API Reference](#8-api-reference)
9. [Responsible Data Handling](#9-responsible-data-handling)
10. [Project Status & Roadmap](#10-project-status--roadmap)
11. [Credits](#11-credits)

---

## 1. The Problem

The Simhastha Kumbh Mela draws **80+ million pilgrims** to Nashik. Every day,
thousands are separated from their families — overwhelmingly **elderly pilgrims**
and **young children**, often rural, non-literate, speaking one of a dozen
languages, and carrying no smartphone.

The system meant to reunite them fails in specific, repeatable ways:

| # | Failure mode | Why it hurts |
|---|--------------|--------------|
| **P1** | **Lost-and-found centers are islands.** A person found at Center A is invisible to a family searching at Center B. | The single biggest cause of delayed reunions. No shared search. |
| **P2** | **Networks collapse at peak density** — exactly on *snan* (holy bathing) days when separations spike 4–5×. | Any cloud-only system is dark when it is needed most. |
| **P3** | **End users have no smartphone and cannot read.** | A self-service app for the pilgrim is a non-starter. |
| **P4** | **Geography is rich but unused.** Chokepoints, transfer nodes, thousands of CCTV cameras, police stations — all mapped, none leveraged for finding people. | Search is blind; help is mispositioned. |
| **P5** | **Data is duplicated and incomplete.** ~8% of reports are cross-center duplicates; ~15% have no name, ~20% no contact number. | Naïve matching breaks or double-counts. |
| **P6** | **The real government portal leaked PII.** "Kho-Ya-Paya" publicly exposed children's photos and parents' phone numbers → extortion. | Doing this wrong is worse than not doing it. |
| **P7** | **No prioritization.** A frail 85-year-old and a healthy adult sit in the same undifferentiated queue. | The most at-risk wait the longest. |

---

## 2. Problem → Solution, Point by Point

Each failure mode maps to a concrete, shipped capability.

| Problem | Setu's solution |
|---------|-----------------|
| **P1 — Center isolation** | **One shared, event-sourced registry** + a **deterministic match engine** that searches across *all* centers at once. One data model (`case` with `case_type ∈ {missing, found}`) does matching, de-duplication, and search. |
| **P2 — Network blackouts** | **Offline-first PWA.** Intake, search, and matching run **on-device** against a local mirror (Dexie/IndexedDB) using a JS "match-lite" with the *same weights* as the server. An append-only outbox replays to the server on reconnect. **No reunion blocks on the cloud.** |
| **P3 — Phoneless / non-literate users** | The **operator** drives a **tap-only, voice-guided wizard** — the pilgrim only points and speaks. Families are reached by **SMS / IVR voice call** on any feature phone (no app, no literacy). |
| **P4 — Unused geography** | **KML → GeoJSON ETL** powers a hotspot/kiosk map, a **CCTV search corridor** (where to look), and **reunion handoff routing** (where to send the family). |
| **P5 — Duplicate / incomplete data** | The same match engine flags **cross-center duplicates**; **available-case normalization** drops missing fields from both sides so a nameless case is carried by geography + age + gender + time, not punished. |
| **P6 — PII exposure** | **Privacy by design:** no public listing, role-gated access, masked contact numbers, a full audit trail (the event log *is* the audit trail), post-reunion PII purge, and a **claim-fraud guard** that blocks wrongful reveals. |
| **P7 — No prioritization** | A **triage queue** ranks open cases by vulnerability and predicts a reunion **ETA**, so the most at-risk are worked first. |

**The governing design rule:** the **deterministic core is the source of truth**.
Claude (attribute extraction, explanations, vision) and the SMS/IVR gateway are
**non-blocking enrichment layers** — if any of them is unreachable, the reunion
still happens.

---

## 3. Architecture at a Glance

```
┌──────────────────────── EDGE (works with zero network) ─────────────────────────┐
│  OPERATOR / FAMILY PWA  — Next.js, installable, tap-only, voice-guided           │
│    Intake · Search & Match · Family self-search · Triage · Map · Supervisor      │
│    Local store (Dexie) + append-only outbox + JS match-lite + cached GeoJSON     │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                     │  background sync (replays on reconnect)
                                     ▼
┌──────────────────────── CORE (FastAPI, when reachable) ──────────────────────────┐
│  Registry (event-sourced SQLite)  ·  Match engine (block → score → fuse → rules) │
│  Geography (KML→GeoJSON, geocode, hotspots, corridor, routing)                   │
│  Triage  ·  Claim-fraud guard  ·  Notify (SMS/IVR)                               │
│  Enrichment (Claude: extract · explain · vision)   ← optional, non-blocking      │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Features, One by One

Each feature below lists **what it does**, **how it works**, a **real-world
example**, and **where to use it**.

### Core — Cross-center match engine *(the hero)*

- **What:** Given a person, return ranked, explainable candidates from every center.
- **How:** Normalize → **blocking** (gender × age-band × geo-bucket ∪ surname ∪ mobile, ~79× fewer comparisons) → per-feature sub-scores → **available-case normalization** → **hard rules** (exact-mobile floor; gender/age hard-mismatch cap) → fuse to a 0–100 score with a per-feature contribution breakdown. Weights live in `shared/match_weights.json`, shared by the Python and JS matchers.
- **Real-world example:** A volunteer at *Panchavati* registers a confused elderly man in a saffron kurta. Before they finish, the engine surfaces a 92% match to a "missing father" report filed two hours earlier at *Trimbakeshwar*, 3 km away — with the reason: *"age exact +14, same language +6, 400 m +16, 2 h apart +7."*
- **Where:** Search & Match screen (`/review`), Supervisor console (`/supervisor`).

### F1 — SMS / IVR Notify-on-Match

- **What:** When a match is confirmed, reach the family on the phone they registered.
- **How:** A provider-abstracted channel — **MockProvider** (console, offline-safe demo) or **TwilioProvider** (real SMS via the Messages API, real **IVR voice** via the Calls API with TwiML `<Say>`). The message is localized (Claude when online, else a bundled 7-language template), gated on **consent** + a reachable number, and the operator **never sees the raw number** (masked everywhere). Every send logs a `pii.notified` audit event.
- **Real-world example:** The lost man's son is roaming the grounds with only a basic feature phone. On confirmation, his phone rings: an IVR voice in Marathi says his father is safe at Panchavati and to show claim code 4821 — no app, no reading required.
- **Where:** Supervisor → confirm a match → **Send SMS / IVR** (in *Reunion actions*). Explicit-number testing via `POST /notify/test`.

### F2 — CCTV Search Corridor

- **What:** Turn thousands of cameras from a passive coverage map into an active *where-to-look* worklist.
- **How:** Geocode the last-seen location, then rank nearby cameras by proximity **biased along the drift direction** — the line toward the nearest egress node (transfer node / parking), where disoriented elders and children actually wander. Pure geometry over the existing camera graph; no video analysis (the dataset has no footage).
- **Real-world example:** A child is lost near *Ramkund Ghat*. Instead of scanning 200 feeds at random, the control room gets an ordered list: the 12 cameras between the ghat and the nearest bus stand, "on drift path" flagged first.
- **Where:** **CCTV search corridor** screen (`/corridor`).

### F3 — Triage Priority Queue + ETA

- **What:** Rank open cases so the most vulnerable are worked first, with a predicted reunion time.
- **How:** A deterministic vulnerability score (unaccompanied child / very old, hospital transfer, no reachable contact, night-hours report) — no training. ETA is the median historical `resolution_hours` for the same age band, with an SLA-breach flag.
- **Real-world example:** At 2 a.m. an 84-year-old with no phone number on file and a "transferred to hospital" status jumps to the top of the queue, flagged red, ahead of a healthy adult reported at noon.
- **Where:** **Triage queue** screen (`/triage`).

### F4 — Family Self-Search

- **What:** The brief's core scenario — a family searching at a different center, on their own terms.
- **How:** The family describes their lost person with the **same tap-only primitives** as intake (gender, age, clothing colour, last-seen landmark). That partial description runs through the **same match engine** against the pool of *found* people. Reversed direction, zero new scoring; results are masked.
- **Real-world example:** A daughter arrives at the *Nashik Road* center looking for her mother, last seen in a green saree at *Ramkund*. She taps three things; the screen returns a ranked list of found women — top match 88%.
- **Where:** **Find my family member** screen (`/family`).

### F5 — Reunion Handoff Routing

- **What:** After a match, tell the family exactly where to go.
- **How:** Finds the nearest help point — a police station (authoritative KML coordinates) or a help center (geocoded) — with straight-line distance and an 8-point compass heading. Offline-friendly: nearest-node + bearing, no external routing API.
- **Real-world example:** Match confirmed at Panchavati; the family is shown *"Panchavati Police Station — 280 m, head NE,"* plus two backup help points.
- **Where:** Supervisor → after a confirmed match (in *Reunion actions*).

### F6 — Claim-Fraud Guard

- **What:** Stop wrongful claims before any contact is revealed — directly countering the extortion that plagued the real portal.
- **How:** Runs at the claim/reveal step. Scores deterministic fraud signals — one claimant against multiple minor cases, answers that contradict the case record, a history of rejected attempts — into a band (**clear / review / block**). A non-clear band blocks auto-reveal and routes to a supervisor; **minors always require guardian consent (DPDP §9)**. Decisions are logged as `claim.flagged` / `claim.cleared`.
- **Real-world example:** A man tries to claim three unrelated lost children in one afternoon. The guard flags `multiple_minor_claims`, blocks the reveal, and forces a supervisor + guardian-consent check.
- **Where:** Supervisor → select a case → **Run fraud check** before reveal.

### Supporting — Geography & Enrichment

- **Hotspot / kiosk map** (`/map`): separation-risk hotspots (report density × category weight) and recommended kiosk sites (high risk ∩ low coverage), from the KML ETL.
- **Claude enrichment** (online, non-blocking): structured attribute extraction from messy free-text descriptions, photo (vision) analysis, and faithful localized "why this is a match" explanations.

---

## 5. Tech Stack

**Backend** — Python 3.12 · FastAPI · SQLite (event-sourced) · RapidFuzz + Jellyfish
(fuzzy/phonetic matching) · Shapely (point-in-polygon) · Anthropic SDK (Claude) ·
httpx (Twilio REST) · managed with **uv**.

**Frontend** — Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Leaflet /
react-leaflet (map) · Dexie (IndexedDB offline store) · Serwist (service worker /
background sync) · Zustand (state) · lucide-react (icons).

**Data** — 2,500 synthetic missing-person records + real geographic layers (32
zones, thousands of CCTV cameras, 85 chokepoints/transfer nodes, 14 police
stations) parsed from the source KMLs.

---

## 6. Project Structure

```
claude-hackathon/
├─ backend/                     # FastAPI core
│  └─ app/
│     ├─ registry/              # event store, projection, audit, seed
│     ├─ match/                 # blocking · features · fusion · engine
│     ├─ geo/                   # KML→GeoJSON ETL · geocode · hotspots · corridor · route
│     ├─ triage/                # F3 vulnerability queue + ETA
│     ├─ search/                # F4 family self-search
│     ├─ notify/                # F1 SMS/IVR (Mock + Twilio providers)
│     ├─ claim/                 # F6 claim-fraud guard
│     ├─ enrich/                # Claude: extract · explain · vision
│     ├─ models.py · db.py · config.py · main.py
│  └─ tests/                    # pytest suite (59 tests)
├─ frontend/                    # Next.js PWA
│  └─ src/
│     ├─ app/                   # routes: intake · review · family · triage · corridor · map · supervisor
│     ├─ components/            # intake wizard · review · map · supervisor · common UI
│     └─ lib/                   # api client · offline (Dexie/sync) · match-lite · types
├─ data/                        # CSV datasets (registry seed + geo)
├─ shared/                      # match_weights.json · location_coords.json (single source of truth)
├─ *.kml                        # source geographic layers
└─ README.md
```

---

## 7. Setup Guide

### Prerequisites
- **Python 3.12+** and **[uv](https://docs.astral.sh/uv/)** (`pip install uv`)
- **Node.js 20+** and npm

### 7.1 Backend

```bash
cd backend
uv sync                                      # install deps from the lockfile
uv run uvicorn app.main:app --reload --port 8000
```
On first run the registry seeds 2,500 cases. Verify: open
<http://127.0.0.1:8000/health> or <http://127.0.0.1:8000/docs> (interactive API).

Run the test suite:
```bash
uv run pytest -q          # 59 tests
```

### 7.2 Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:3000
```
The PWA talks to the backend at `http://127.0.0.1:8000` by default (override with
`NEXT_PUBLIC_API_URL`).

### 7.3 Environment (`.env` at the repo root — git-ignored)

All secrets are optional; the app runs fully without them (Claude features and
real SMS simply no-op / use the mock).

```dotenv
# --- Claude enrichment (optional) ---
ANTHROPIC_API_KEY=sk-ant-...

# --- SMS / IVR notify (optional; defaults to a console mock) ---
NOTIFY_PROVIDER=mock                 # set to "twilio" to send real SMS/IVR
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM=+1XXXXXXXXXX             # SMS sender (Twilio number)
TWILIO_VOICE_FROM=+1XXXXXXXXXX       # IVR caller id (defaults to TWILIO_FROM)
```

#### Acquiring Twilio credentials (for real SMS / IVR)
1. Create a free trial account at <https://www.twilio.com/try-twilio>.
2. From the **Console** → *Account Info*, copy the **Account SID** and **Auth Token**.
3. **Phone Numbers → Buy a number** (Voice + SMS capable) → use as `TWILIO_FROM`.
4. **Phone Numbers → Verified Caller IDs** → add and verify the recipient number
   (trial accounts can only message verified numbers).
5. Fill in `.env`, set `NOTIFY_PROVIDER=twilio`, and restart the backend.

> **India note:** IVR **voice** calls to a verified number work on a trial
> account. International **SMS** to Indian numbers is frequently carrier-blocked
> without a paid account + a DLT-registered sender — test the IVR channel first.

#### Test a real send
```bash
# SMS
curl -X POST http://127.0.0.1:8000/notify/test \
  -H "Content-Type: application/json" \
  -d '{"to":"+91XXXXXXXXXX","center":"Panchavati Center","code":"4821","language":"Marathi","channel":"sms"}'

# IVR voice call
curl -X POST http://127.0.0.1:8000/notify/test \
  -H "Content-Type: application/json" \
  -d '{"to":"+91XXXXXXXXXX","center":"Panchavati Center","code":"4821","language":"English","channel":"ivr"}'
```

### 7.4 Demo walkthrough
1. **Toggle offline** (top bar) → register a person on the Intake wizard → it saves locally and queues.
2. **Toggle online** → the outbox syncs to the server.
3. Open **Search & Match** or **Find my family member** → see cross-center candidates.
4. Switch role to **Supervisor** → confirm a match → run the **fraud check**, **notify** the family, and view the **handoff** route.
5. Visit **Triage** and **CCTV corridor** for the vulnerability queue and camera worklist.

---

## 8. API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET`  | `/health` | Service + Claude-key status |
| `POST` | `/registry/events` | Idempotent bulk event ingest (the sync endpoint) |
| `GET`  | `/registry/cases` | List cases (PII masked unless `X-Role: supervisor`) |
| `GET`  | `/registry/cases/{id}` | One case |
| `GET`  | `/registry/cases/{id}/audit` | Audit trail (the event log) |
| `POST` | `/match` | Rank cross-center candidates |
| `POST` | `/match/dedupe` | Cross-center duplicate detection |
| `GET`  | `/triage/queue` | **F3** vulnerability-ranked queue + ETA |
| `GET`  | `/geo/corridor` | **F2** CCTV search corridor |
| `GET`  | `/geo/handoff` | **F5** nearest help-point routing |
| `POST` | `/search/family` | **F4** family self-search (found pool) |
| `POST` | `/notify/match` | **F1** notify a case's reporter |
| `POST` | `/notify/test` | **F1** send to an explicit number (SMS/IVR) |
| `POST` | `/claim/assess` | **F6** claim-fraud assessment |
| `GET`  | `/geo/hotspots` · `/geo/kiosks` · `/geo/geocode` | Geography services |
| `POST` | `/enrich/attributes` · `/explain` · `/vision` · `/compare` | Claude enrichment |

Full interactive docs at `/docs` when the backend is running.

---

## 9. Responsible Data Handling

Setu inverts every failure of the real "Kho-Ya-Paya" portal:

- **No public listing** — operator/supervisor only, role-gated.
- **Contact numbers masked** (`+91 ••••••6506`) until a supervisor confirms a match; the system, not the operator, places the call/SMS.
- **The event log is the audit trail** — every PII reveal, notify, and merge is recorded.
- **Consent captured** at intake; **guardian consent for minors** (DPDP §9).
- **Post-reunion PII purge** — name, contact, photo, and description are dropped, leaving an anonymized, auditable shell.
- **Claim-fraud guard** blocks wrongful reveals before they happen.
- The matchable store keeps **embeddings, not raw images**; biometrics never leave the edge.

---

## 10. Project Status & Roadmap

**Implemented & tested:** the registry, cross-center match engine, geography ETL,
Claude enrichment, the PWA (intake, search, map, supervisor), and the six
extension features above (F1–F6). Backend test suite: **59 passing**.

**Roadmap:**
- **F7 — Pre-registration QR wristband:** pre-enroll vulnerable pilgrims at entry
  gates for instant found-lookup (prevention layer).
- Real SMS for India via a DLT-registered sender or an India-native gateway
  (MSG91 / Fast2SMS) alongside Twilio.
- Peer-to-peer mesh sync between nearby centers for fully internet-free operation.

---

## 11. Credits

Built for the **Claude Impact Lab — Mumbai 2026**. Geographic data provided by the
**Kumbhathon Innovation Foundation**; the missing-person dataset is **synthetic**
(no real personal data). See [`README_main.md`](README_main.md) for the original
dataset package and problem brief.
