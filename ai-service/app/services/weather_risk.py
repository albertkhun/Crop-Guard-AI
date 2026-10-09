"""Rule-based environmental context. NOT a trained model and NOT part of the CNN.

Label used everywhere: "Rule-based environmental context; trainable fusion is future work".
Thresholds live in data/weather_rules.json and are unverified placeholders until you replace them.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Awaitable, Callable, Sequence

import httpx
import numpy as np

from app.config import Settings

log = logging.getLogger("paddyguard.weather")

HOURLY_VARS = "temperature_2m,relative_humidity_2m,precipitation"
FETCHER = Callable[[float, float], Awaitable[dict]]


class WeatherUnavailable(Exception):
    pass


# ----------------------------------------------------------- feature extraction
def parse_open_meteo(payload: dict) -> dict:
    """Validate an Open-Meteo hourly payload. Times are local (timezone=auto)."""
    try:
        h = payload["hourly"]
        times = [datetime.fromisoformat(t) for t in h["time"]]
        temp, rh, pr = h["temperature_2m"], h["relative_humidity_2m"], h["precipitation"]
        offset = int(payload.get("utc_offset_seconds", 0))
    except (KeyError, TypeError, ValueError) as e:
        raise WeatherUnavailable(f"Unexpected Open-Meteo payload: {e}") from e
    if not (len(times) == len(temp) == len(rh) == len(pr)) or not times:
        raise WeatherUnavailable("Open-Meteo arrays are empty or have different lengths")
    return {"times": times, "temp": temp, "rh": rh, "precip": pr, "utc_offset_s": offset}


def compute_features(times: Sequence[datetime], temp: Sequence, rh: Sequence, precip: Sequence, defs: dict) -> dict:
    """The six features (+ hours_covered). `None` readings are skipped."""
    d0, d1 = defs.get("day_start_hour", 6), defs.get("day_end_hour", 18)
    hi_rh, rainy_mm = defs.get("high_humidity_pct", 90), defs.get("rainy_day_mm", 1.0)

    day_t, rh_all, hi_hours, rain_total = [], [], 0, 0.0
    night_min_by_date: dict = {}
    rain_by_date: dict = {}
    covered = 0
    for t, tv, rv, pv in zip(times, temp, rh, precip):
        covered += 1
        if tv is not None:
            if d0 <= t.hour < d1:
                day_t.append(tv)
            else:
                k = t.date()
                night_min_by_date[k] = tv if k not in night_min_by_date else min(night_min_by_date[k], tv)
        if rv is not None:
            rh_all.append(rv)
            if rv > hi_rh:
                hi_hours += 1
        if pv is not None:
            rain_total += pv
            rain_by_date[t.date()] = rain_by_date.get(t.date(), 0.0) + pv

    def mean(xs):
        return round(float(np.mean(xs)), 1) if xs else None

    return {
        "mean_day_temp_c": mean(day_t),
        "mean_night_min_c": mean(list(night_min_by_date.values())),
        "mean_humidity_pct": mean(rh_all),
        "hours_humidity_gt90": int(hi_hours),
        "total_rainfall_mm": round(rain_total, 1),
        "rainy_days": int(sum(1 for v in rain_by_date.values() if v >= rainy_mm)),
        "hours_covered": covered,
    }


def split_windows(parsed: dict, now_utc: datetime, defs: dict) -> tuple[dict, dict]:
    """past = last `window_hours` up to now (local), next = the following `window_hours`."""
    n = int(defs.get("window_hours", 168))
    now_local = (now_utc.astimezone(timezone.utc) + timedelta(seconds=parsed["utc_offset_s"])).replace(tzinfo=None)
    now_local = now_local.replace(minute=0, second=0, microsecond=0)
    past_lo, next_hi = now_local - timedelta(hours=n), now_local + timedelta(hours=n)

    def window(pred):
        idx = [i for i, t in enumerate(parsed["times"]) if pred(t)]
        return compute_features([parsed["times"][i] for i in idx], [parsed["temp"][i] for i in idx],
                                [parsed["rh"][i] for i in idx], [parsed["precip"][i] for i in idx], defs)

    return window(lambda t: past_lo < t <= now_local), window(lambda t: now_local < t <= next_hi)


# ------------------------------------------------------------------- rule set
@dataclass(frozen=True)
class Assessment:
    verdict: str          # supports | conflicts | neutral | no_rule
    met: int
    total: int
    multiplier: float


class RuleBook:
    def __init__(self, rules: dict):
        self.rules = rules
        self.defs = rules.get("feature_definitions", {})
        ev = rules.get("evaluation", {})
        self.support_min = ev.get("support_min_fraction", 0.67)
        self.conflict_max = ev.get("conflict_max_fraction", 0.0)
        self.min_mult = ev.get("min_multiplier", 0.8)
        self.max_mult = ev.get("max_multiplier", 1.25)
        self.verified = bool(rules.get("_meta", {}).get("verified", False))
        self.diseases = rules.get("diseases", {})

    @property
    def label(self) -> str:
        s = "Rule-based environmental context; trainable fusion is future work."
        if not self.verified:
            s += " Thresholds are unverified placeholders (TODO_VERIFY), not field-validated."
        return s

    # -- single-disease assessment
    def assess(self, key: str, features: dict) -> Assessment:
        conds = self.diseases.get(key, {}).get("conditions", [])
        met = total = 0
        for c in conds:
            v = features.get(c["feature"])
            if v is None:
                continue
            total += 1
            if ("min" in c and v < c["min"]) or ("max" in c and v > c["max"]):
                continue
            met += 1
        if total == 0:
            return Assessment("no_rule", 0, 0, 1.0)
        frac, d = met / total, self.diseases[key]
        if frac >= self.support_min:
            verdict, mult = "supports", d.get("supporting_multiplier", 1.0)
        elif frac <= self.conflict_max:
            verdict, mult = "conflicts", d.get("conflicting_multiplier", 1.0)
        else:
            verdict, mult = "neutral", 1.0
        return Assessment(verdict, met, total, float(min(max(mult, self.min_mult), self.max_mult)))

    # -- reorder close calls (only ever used when status == low_confidence)
    def adjust(self, probs: Sequence[float], class_names: Sequence[str], features: dict) -> np.ndarray:
        raw = np.asarray(probs, dtype=np.float64)
        mult = np.array([self.assess(k, features).multiplier for k in class_names])
        adj = raw * mult
        return adj / adj.sum()

    # -- text for /predict
    def context_note(self, candidates: Sequence[tuple[str, str]], past: dict) -> str:
        def f(v, unit=""):
            return "n/a" if v is None else f"{v}{unit}"
        summary = (f"Past 7 days: {past['hours_humidity_gt90']} h above 90% humidity, "
                   f"{past['total_rainfall_mm']} mm rain over {past['rainy_days']} rainy day(s), "
                   f"mean night minimum {f(past['mean_night_min_c'], ' C')}.")
        parts = []
        for key, name in candidates:
            a = self.assess(key, past)
            if a.verdict == "no_rule":
                parts.append(f"No weather rule is defined for {name}, so weather says nothing about it.")
            elif a.verdict == "supports":
                parts.append(f"Recent weather matches the rule set's conditions for {name} ({a.met} of {a.total}).")
            elif a.verdict == "conflicts":
                parts.append(f"Recent weather does not match the rule set's conditions for {name} ({a.met} of {a.total}).")
            else:
                parts.append(f"Recent weather partly matches the rule set's conditions for {name} ({a.met} of {a.total}).")
        tail = "This does not change the image-based diagnosis. " if len(candidates) == 1 else ""
        return f"{summary} {' '.join(parts)} {tail}{self.label}"

    # -- standalone risk (next 7 days)
    def risk(self, nxt: dict, class_names: Sequence[str], display: dict[str, str]):
        rows, elevated = [], []
        for k in class_names:
            a = self.assess(k, nxt)
            if a.verdict == "no_rule":
                level = "no_rule"
            elif a.verdict == "supports":
                level = "elevated"
                elevated.append(display[k])
            elif a.verdict == "conflicts":
                level = "low"
            else:
                level = "moderate"
            rows.append({"class_key": k, "display_name": display[k], "level": level,
                         "conditions_met": a.met, "conditions_total": a.total})
        if elevated:
            msg = ("Next 7 days: forecast conditions match the rule set's wet-weather pattern for "
                   + ", ".join(elevated) + ". Scout your field closely.")
        else:
            msg = "Next 7 days: no elevated risk flagged by the rule set."
        return f"{msg} {self.label}", rows


def load_rulebook(path: Path) -> RuleBook:
    return RuleBook(json.loads(Path(path).read_text(encoding="utf-8")))


# ---------------------------------------------------------- fetch + 1-hour cache
@dataclass
class WeatherSnapshot:
    past: dict
    next: dict


class WeatherService:
    MAX_CACHE = 256

    def __init__(self, settings: Settings, rulebook: RuleBook,
                 fetcher: FETCHER | None = None, client: httpx.AsyncClient | None = None):
        self.s, self.rb = settings, rulebook
        self._client = client
        self._fetcher = fetcher or self._fetch_open_meteo
        self._cache: dict[tuple[float, float], tuple[float, dict]] = {}

    async def _fetch_open_meteo(self, lat: float, lon: float) -> dict:
        client = self._client or httpx.AsyncClient(timeout=self.s.weather_timeout_s)
        try:
            r = await client.get(self.s.open_meteo_url, params={
                "latitude": lat, "longitude": lon, "hourly": HOURLY_VARS,
                "past_days": 7, "forecast_days": 8, "timezone": "auto"})
            r.raise_for_status()
            return r.json()
        finally:
            if self._client is None:
                await client.aclose()

    async def _payload(self, lat: float, lon: float) -> dict:
        key = (round(lat, 2), round(lon, 2))
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < self.s.weather_cache_ttl_s:
            return hit[1]
        try:
            payload = await self._fetcher(lat, lon)
        except (httpx.HTTPError, ValueError) as e:
            raise WeatherUnavailable(f"Open-Meteo request failed: {e}") from e
        if len(self._cache) >= self.MAX_CACHE:
            self._cache.pop(min(self._cache, key=lambda k: self._cache[k][0]))
        self._cache[key] = (time.monotonic(), payload)
        return payload

    async def snapshot(self, lat: float, lon: float, now_utc: datetime | None = None) -> WeatherSnapshot:
        """Raises WeatherUnavailable on any failure."""
        parsed = parse_open_meteo(await self._payload(lat, lon))
        past, nxt = split_windows(parsed, now_utc or datetime.now(timezone.utc), self.rb.defs)
        return WeatherSnapshot(past, nxt)

    async def try_snapshot(self, lat: float, lon: float) -> WeatherSnapshot | None:
        """Never raises: weather is optional for /predict."""
        try:
            return await self.snapshot(lat, lon)
        except WeatherUnavailable as e:
            log.warning("weather unavailable, continuing without it: %s", e)
            return None
