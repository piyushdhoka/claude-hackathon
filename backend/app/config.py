"""Central configuration. Reads secrets from the repo-root .env (gitignored)."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> repo root is two parents up from this file's dir
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Secrets ---
    anthropic_api_key: str = ""

    # --- Models (latest Claude family) ---
    # We have ample credits -> default the quality-sensitive, multilingual paths to Opus 4.8.
    # Flip extract -> sonnet/haiku if bulk-enriching all 2500 records and latency matters.
    claude_extract_model: str = "claude-opus-4-8"       # structured attribute extraction (multilingual)
    claude_explain_model: str = "claude-opus-4-8"       # faithful localized match explanations
    claude_translate_model: str = "claude-opus-4-8"     # wizard/voice prompt translation (10 languages)
    claude_fast_model: str = "claude-haiku-4-5"         # available fallback for high-volume/low-latency

    # --- Feature flags ---
    face_match_enabled: bool = False

    # --- Paths ---
    # Datasets live at the repo root: CSVs under data/, KMLs at the root.
    data_dir: Path = REPO_ROOT / "data"
    kml_dir: Path = REPO_ROOT
    db_path: Path = BACKEND_DIR / "setu.db"
    geojson_out: Path = REPO_ROOT / "frontend" / "public" / "geo"

    @property
    def missing_persons_csv(self) -> Path:
        return self.data_dir / "Synthetic_Missing_Persons_2500.csv"

    @property
    def cctv_kml(self) -> Path:
        return self.kml_dir / "CCTV Dataset.kml"

    @property
    def police_kml(self) -> Path:
        return self.kml_dir / "Police Stations.kml"

    @property
    def chokepoints_kml(self) -> Path:
        return self.kml_dir / "nashik_kumbh_chokepoints_parking_map.kml"


settings = Settings()
