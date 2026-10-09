"""MOCK_AI=true support: canned model outputs + synthetic weather, so the frontend can be built
without TensorFlow or network access. The REAL gate, advice, and rule code still runs on top."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np

SCENARIOS = ("ok", "low_confidence", "unclear_image")

# class -> prob (the rest is spread evenly). Class keys must exist in class_names.json.
_SPEC = {
    "ok": {"blast": 0.93, "brown_spot": 0.04},
    "low_confidence": {"blast": 0.52, "brown_spot": 0.31},
    "unclear_image": {"blast": 0.18, "brown_spot": 0.15},
}


class MockModelService:
    def __init__(self, class_names: list[str], version: str = "mock-v0"):
        self.class_names, self.version = class_names, version

    def predict(self, batch: np.ndarray, mock_scenario: str | None = None) -> np.ndarray:
        scenario = mock_scenario if mock_scenario in SCENARIOS else "ok"
        spec = _SPEC[scenario]
        n = len(self.class_names)
        probs = np.zeros(n)
        for k, v in spec.items():
            probs[self.class_names.index(k)] = v
        rest = [i for i in range(n) if probs[i] == 0]
        probs[rest] = (1.0 - sum(spec.values())) / len(rest)
        return probs


def synthetic_open_meteo_payload(now_utc: datetime | None = None, humid: bool = True,
                                 utc_offset_s: int = 19800) -> dict:
    """Hourly payload shaped like Open-Meteo (7 past + 8 forecast days, local times)."""
    now_utc = now_utc or datetime.now(timezone.utc)
    now_local = (now_utc + timedelta(seconds=utc_offset_s)).replace(tzinfo=None, minute=0, second=0, microsecond=0)
    start = (now_local - timedelta(days=7)).replace(hour=0)
    times, temp, rh, pr = [], [], [], []
    for i in range(15 * 24):
        t = start + timedelta(hours=i)
        day = 6 <= t.hour < 18
        times.append(t.strftime("%Y-%m-%dT%H:%M"))
        temp.append(30.0 if day else 22.0)
        rh.append((95 if not day else 85) if humid else 60)
        pr.append(1.0 if (humid and t.hour in (14, 15)) else 0.0)
    return {"utc_offset_seconds": utc_offset_s, "timezone": "Asia/Kolkata",
            "hourly": {"time": times, "temperature_2m": temp, "relative_humidity_2m": rh, "precipitation": pr}}


async def mock_fetcher(lat: float, lon: float) -> dict:
    return synthetic_open_meteo_payload()
