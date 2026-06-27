# Setu — Demo Runbook

Two pillars judges care about, scripted so they land every time:
**(1) cross-center unified search** and **(2) offline-first**.

## 0. Start it

```bash
# Terminal 1 — backend (seeds 2,500 cases on first boot)
cd backend && uv run uvicorn app.main:app --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev      # http://localhost:3000
```

The top bar has two demo controls: an **Online/Offline** toggle (simulates a
snan-day blackout) and a **role** switch (operator ⇄ supervisor). The operator's
station defaults to **Ramkund Kho-Ya-Paya Kendra**.

---

## PILLAR 1 — Cross-center reunion (the hero moment)

The gap we close: a found person at one center is invisible to a family searching
at another. Here a found elder registered at **Ramkund** instantly matches a
missing report filed at a **different center (Nashik Road)**.

**Target (already in the registry):** `KMP-2027-00029` — *Kanta Trivedi*, Female,
71–80, Hindi, last seen **Sadhugram Gate 2**, reported at **Nashik Road Center**.

**Script — Register a FOUND person (tap-only):**
1. Home → **Register a person** → **Found**.
2. Language → **हिन्दी (Hindi)**.
3. Who → **Elder woman**. Age → **71–80**.
4. (Optional) clothing colour / marks — skip or tap a couple.
5. Last seen → **Sadhugram Gate 2**.
6. (Optional) Photo → capture/upload → watch Claude describe the person in Hindi.
7. (Optional) Name → "Kanta Trivedi". **Confirm.**
8. **Result:** a ranked match list appears. Top hit is **KMP-2027-00029**, badged
   **Nashik Road Center** — a *different center* than Ramkund. That's the gap, closed.
   The card shows the per-feature **why** (geo, age, gender, language, name) and a
   Claude rationale in the family's language.

**The hard case (do this to impress):** repeat without a name/mobile (15%/20% of
real cases have none). The same elder still surfaces at the top, matched purely on
**location + age + gender + language + time** — then a human confirms.

**Cross-center matching, measured** (`cd backend && uv run python -m app.match.eval`):
on 200 semi-synthetic cross-center re-sightings (home origin unknown,
name/mobile/description often blank, neighbouring location, ±1 age drift):
- **recall@1 = 0.99**, **recall@5 = 1.0**
- **~237 candidates scored/query — 90.5% fewer** than brute-force (3.1M pairs)
- **~40 ms/query**

---

## PILLAR 2 — Offline-first (networks die on snan days)

Everything critical works with **no network**, then syncs on reconnect.

**Script:**
1. Flip the top bar to **Offline**.
2. **Register a person** end-to-end — it saves instantly ("Saved offline — will
   sync when back online"), shows the **QR case token**, and the pending-sync
   badge increments. (Writes go to a durable Dexie outbox first.)
3. Go to **Search & Match** — a banner reads *"Offline — searching the locally
   cached registry with the on-device matcher."* Pick a case → ranked candidates
   still appear, scored by the in-browser matcher (`match-lite`, same weights as
   the server). Cross-center search survives the blackout.
4. Flip back to **Online** → the outbox flushes automatically (idempotent on event
   UUIDs), the pending badge returns to 0. Two centers converge.

Why it's sound: append-only events with client UUIDs → safe replay; the registry
is the event log (also the audit trail); reads fall back to a mirrored copy.

---

## Visual capture & analysis (Claude vision)

In intake, the **photo step** sends the image to Claude (Opus 4.8, multimodal),
which returns a **localized visual description** + structured attributes (clothing,
colours, build, hair, accessories, marks) — the strongest signal for nameless
elders. At review, two candidate photos can be compared with Claude's **"same
person?"** second opinion (assistive; a human always confirms). No biometric model
is loaded — it's all the Claude API.

---

## Geography → where to put the next help point

Open **Hotspot Map**. Separation risk = report density × node type; the top
hotspots are **Nashik Road Station, Ramkund Ghat, Sadhugram Gate 2, Madsangvi
Transit**. Kiosk recommendation = high risk ∩ low coverage, e.g.:

> **Madsangvi Transit** — 149 separations, nearest help point 8.1 km away, 0
> cameras within 500 m → put a kiosk here.

---

## Responsible data (beating the real portal's failures)

- `reporter_mobile` is **masked** (`+91 ••••••6506`) until a **supervisor**
  explicitly reveals it on a confirmed match (switch role to see it unmask — the
  reveal is logged).
- No public listing; every action is an auditable event (`/registry/cases/{id}/audit`).
- Photos/PII are scheduled to **purge after reunion**; consent captured at intake.
