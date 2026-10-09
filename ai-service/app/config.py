"""Environment-driven settings. Everything tunable lives here or in data/*.json."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # ai-service/


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


def _env_float(name: str, default: float) -> float:
    v = os.getenv(name)
    return default if v in (None, "") else float(v)


def _env_int(name: str, default: int) -> int:
    v = os.getenv(name)
    return default if v in (None, "") else int(v)


def _env_str(name: str, default: str) -> str:
    v = os.getenv(name)
    return default if v in (None, "") else v


def _env_path(name: str, default: Path) -> Path:
    v = os.getenv(name)
    return Path(v) if v else default


@dataclass(frozen=True)
class Settings:
    # --- security ---
    internal_key: str = ""
    enable_docs: bool = False
    # --- mode ---
    mock_ai: bool = False
    # --- gate (all TODO_VERIFY: tune on a held-out set, see scripts/evaluate.py) ---
    confidence_threshold: float = 0.85
    unclear_min_max_prob: float = 0.40       # below this top-1 prob -> unclear_image
    unclear_max_norm_entropy: float = 0.80   # above this normalized entropy -> unclear_image
    # --- upload validation ---
    max_upload_bytes: int = 10 * 1024 * 1024
    min_image_side: int = 64
    max_image_pixels: int = 40_000_000
    resize_backend: str = "pil"              # "pil" | "tf" (tf matches keras image_dataset_from_directory)
    # --- weather ---
    weather_cache_ttl_s: int = 3600
    weather_timeout_s: float = 6.0
    open_meteo_url: str = "https://api.open-meteo.com/v1/forecast"
    # --- files (swap the model by replacing these files only) ---
    model_path: Path = BASE_DIR / "models" / "paddy_best.keras"
    class_names_path: Path = BASE_DIR / "models" / "class_names.json"
    model_meta_path: Path = BASE_DIR / "models" / "model_meta.json"
    treatments_path: Path = BASE_DIR / "data" / "treatments.json"
    weather_rules_path: Path = BASE_DIR / "data" / "weather_rules.json"
    retake_hints_path: Path = BASE_DIR / "data" / "retake_hints.json"

    def __post_init__(self) -> None:
        if not (0.0 < self.confidence_threshold <= 1.0):
            raise ValueError("CONFIDENCE_THRESHOLD must be in (0, 1]")
        if not (0.0 <= self.unclear_min_max_prob < self.confidence_threshold):
            raise ValueError("UNCLEAR_MIN_MAX_PROB must be in [0, CONFIDENCE_THRESHOLD)")
        if not (0.0 < self.unclear_max_norm_entropy <= 1.0):
            raise ValueError("UNCLEAR_MAX_NORM_ENTROPY must be in (0, 1]")
        if self.resize_backend not in {"pil", "tf"}:
            raise ValueError("RESIZE_BACKEND must be 'pil' or 'tf'")

    @classmethod
    def from_env(cls) -> "Settings":
        d = cls()  # defaults
        return cls(
            internal_key=_env_str("INTERNAL_KEY", d.internal_key),
            enable_docs=_env_bool("ENABLE_DOCS", d.enable_docs),
            mock_ai=_env_bool("MOCK_AI", d.mock_ai),
            confidence_threshold=_env_float("CONFIDENCE_THRESHOLD", d.confidence_threshold),
            unclear_min_max_prob=_env_float("UNCLEAR_MIN_MAX_PROB", d.unclear_min_max_prob),
            unclear_max_norm_entropy=_env_float("UNCLEAR_MAX_NORM_ENTROPY", d.unclear_max_norm_entropy),
            max_upload_bytes=_env_int("MAX_UPLOAD_BYTES", d.max_upload_bytes),
            min_image_side=_env_int("MIN_IMAGE_SIDE", d.min_image_side),
            max_image_pixels=_env_int("MAX_IMAGE_PIXELS", d.max_image_pixels),
            resize_backend=_env_str("RESIZE_BACKEND", d.resize_backend),
            weather_cache_ttl_s=_env_int("WEATHER_CACHE_TTL_S", d.weather_cache_ttl_s),
            weather_timeout_s=_env_float("WEATHER_TIMEOUT_S", d.weather_timeout_s),
            open_meteo_url=_env_str("OPEN_METEO_URL", d.open_meteo_url),
            model_path=_env_path("MODEL_PATH", d.model_path),
            class_names_path=_env_path("CLASS_NAMES_PATH", d.class_names_path),
            model_meta_path=_env_path("MODEL_META_PATH", d.model_meta_path),
            treatments_path=_env_path("TREATMENTS_PATH", d.treatments_path),
            weather_rules_path=_env_path("WEATHER_RULES_PATH", d.weather_rules_path),
            retake_hints_path=_env_path("RETAKE_HINTS_PATH", d.retake_hints_path),
        )
