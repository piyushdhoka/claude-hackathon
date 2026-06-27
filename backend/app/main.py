"""Setu API — unified, offline-capable missing-persons registry for Kumbh Mela 2027.

Run:  uv run uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .enrich.router import router as enrich_router
from .geo.router import router as geo_router
from .match.router import router as match_router
from .registry.router import router as registry_router
from .registry.seed import seed


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        n = seed()  # idempotent: only seeds an empty registry
        print(f"[setu] registry ready ({n} cases)")
    except FileNotFoundError as e:
        print(f"[setu] WARNING: seed skipped, dataset not found: {e}")
    yield


app = FastAPI(
    title="Setu API",
    description="One registry, every center. Cross-center missing-persons reunification.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo; tighten for deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(registry_router)
app.include_router(match_router)
app.include_router(geo_router)
app.include_router(enrich_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "claude_key_present": bool(settings.anthropic_api_key),
    }
