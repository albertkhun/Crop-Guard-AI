"""Pydantic response schemas. PredictResponse is the contract Express/React rely on."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class Prediction(BaseModel):
    class_key: str
    display_name: str
    confidence: float  # RAW CNN top-1 probability, never weather-adjusted


class Top3Item(BaseModel):
    class_key: str
    display_name: str
    raw_prob: float
    adjusted_prob: float


class Advice(BaseModel):
    severity_guide: str
    immediate_actions: list[str]
    organic_options: list[str]
    preventive: list[str]
    recovery_timeline: str
    consult_expert_if: str
    safety_note: str


class WeatherFeatureSet(BaseModel):
    mean_day_temp_c: float | None
    mean_night_min_c: float | None
    mean_humidity_pct: float | None
    hours_humidity_gt90: int
    total_rainfall_mm: float
    rainy_days: int
    hours_covered: int


class WeatherBlock(BaseModel):
    # {"past_7d": {...}, "next_7d": {...}}
    features: dict[str, WeatherFeatureSet]
    context_note: str
    risk_alert: str
    source: Literal["open-meteo"] = "open-meteo"


class PredictResponse(BaseModel):
    status: Literal["ok", "low_confidence", "unclear_image"]
    prediction: Prediction | None
    top3: list[Top3Item]
    retake_hint: str | None
    advice: Advice | None
    weather: WeatherBlock | None
    model_version: str


class DiseaseRisk(BaseModel):
    class_key: str
    display_name: str
    level: Literal["low", "moderate", "elevated", "no_rule"]
    conditions_met: int
    conditions_total: int


class WeatherRiskResponse(BaseModel):
    features: dict[str, WeatherFeatureSet]
    risk_alert: str
    per_disease: list[DiseaseRisk]
    source: Literal["open-meteo"] = "open-meteo"


class HealthResponse(BaseModel):
    status: Literal["ok"]
    model_loaded: bool
    mock_ai: bool
    model_version: str


class ClassInfo(BaseModel):
    class_key: str
    display_name: str


class ClassesResponse(BaseModel):
    classes: list[ClassInfo]
    model_version: str
