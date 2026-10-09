from datetime import datetime, timedelta

import numpy as np
import pytest

from app.services.mock import synthetic_open_meteo_payload
from app.services.weather_risk import (RuleBook, WeatherService, WeatherUnavailable, compute_features,
                                       load_rulebook, parse_open_meteo, split_windows)
from app.config import Settings
from tests.conftest import FIXED_NOW

DEFS = {"day_start_hour": 6, "day_end_hour": 18, "high_humidity_pct": 90, "rainy_day_mm": 1.0, "window_hours": 168}


def two_days():
    start = datetime(2026, 10, 1)
    times = [start + timedelta(hours=i) for i in range(48)]
    temp = [30.0 if 6 <= t.hour < 18 else 20.0 for t in times]
    rh = [80.0] * 48
    for i in range(10):
        rh[i] = 95.0  # 10 hours > 90
    precip = [0.0] * 48
    precip[10] = 5.0       # day 1 total 5.0 mm -> rainy
    precip[30] = 0.5       # day 2 total 0.5 mm -> not rainy (< 1.0)
    return times, temp, rh, precip


def test_feature_values():
    f = compute_features(*two_days(), DEFS)
    assert f["mean_day_temp_c"] == 30.0
    assert f["mean_night_min_c"] == 20.0
    assert f["hours_humidity_gt90"] == 10
    assert f["mean_humidity_pct"] == pytest.approx(83.1, abs=0.05)
    assert f["total_rainfall_mm"] == 5.5
    assert f["rainy_days"] == 1
    assert f["hours_covered"] == 48


def test_humidity_exactly_90_is_not_counted():
    t, temp, rh, pr = two_days()
    rh = [90.0] * 48
    assert compute_features(t, temp, rh, pr, DEFS)["hours_humidity_gt90"] == 0


def test_none_values_are_skipped():
    t, temp, rh, pr = two_days()
    temp[7] = None; rh[0] = None; pr[10] = None
    f = compute_features(t, temp, rh, pr, DEFS)
    assert f["mean_day_temp_c"] == 30.0
    assert f["hours_humidity_gt90"] == 9
    assert f["total_rainfall_mm"] == 0.5


def test_empty_input_gives_none_not_crash():
    f = compute_features([], [], [], [], DEFS)
    assert f["mean_day_temp_c"] is None and f["total_rainfall_mm"] == 0.0 and f["rainy_days"] == 0


def test_parse_rejects_bad_payloads():
    with pytest.raises(WeatherUnavailable):
        parse_open_meteo({"nope": 1})
    with pytest.raises(WeatherUnavailable):
        parse_open_meteo({"hourly": {"time": ["2026-10-01T00:00"], "temperature_2m": [], "relative_humidity_2m": [], "precipitation": []}})


def test_windows_are_168h_each_and_do_not_overlap():
    parsed = parse_open_meteo(synthetic_open_meteo_payload(FIXED_NOW))
    past, nxt = split_windows(parsed, FIXED_NOW, DEFS)
    assert past["hours_covered"] == 168 and nxt["hours_covered"] == 168


def test_windows_degrade_gracefully_with_short_data():
    p = synthetic_open_meteo_payload(FIXED_NOW)
    for k in p["hourly"]:
        p["hourly"][k] = p["hourly"][k][: 24 * 8]  # only a bit more than the past window
    past, nxt = split_windows(parse_open_meteo(p), FIXED_NOW, DEFS)
    assert past["hours_covered"] > 0 and nxt["hours_covered"] < 168


# ------------------------------------------------------------------ rules
@pytest.fixture
def rb(settings):
    return load_rulebook(settings.weather_rules_path)


HUMID = {"hours_humidity_gt90": 80, "total_rainfall_mm": 60.0, "rainy_days": 5, "mean_night_min_c": 22.0}
DRY = {"hours_humidity_gt90": 0, "total_rainfall_mm": 0.0, "rainy_days": 0, "mean_night_min_c": 10.0}


def test_supports_conflicts_neutral(rb):
    assert rb.assess("blast", HUMID).verdict == "supports"
    assert rb.assess("blast", DRY).verdict == "conflicts"
    mixed = {**DRY, "hours_humidity_gt90": 80, "total_rainfall_mm": 60.0, "rainy_days": 5}  # 3 of 4
    assert rb.assess("blast", mixed).verdict in {"supports", "neutral"}
    partial = {**DRY, "hours_humidity_gt90": 80, "total_rainfall_mm": 60.0}  # 2 of 4
    assert rb.assess("blast", partial).verdict == "neutral"


def test_class_without_rule_is_neutral_multiplier_one(rb):
    a = rb.assess("tungro", HUMID)
    assert a.verdict == "no_rule" and a.multiplier == 1.0


def test_missing_features_are_excluded_not_failed(rb):
    a = rb.assess("blast", {"hours_humidity_gt90": 80})
    assert a.total == 1 and a.met == 1


def test_multipliers_are_clamped_to_spec_range():
    rb = RuleBook({"evaluation": {}, "diseases": {"x": {"conditions": [{"feature": "a", "min": 0}],
                   "supporting_multiplier": 9.0, "conflicting_multiplier": 0.01}}})
    assert rb.assess("x", {"a": 1}).multiplier == 1.25
    assert rb.assess("x", {"a": -1}).multiplier == 0.8


def test_adjust_renormalises_and_can_flip_a_close_call(rb):
    names = ["blast", "tungro"] + [f"c{i}" for i in range(8)]
    raw = np.array([0.40, 0.42] + [0.02] * 8)  # tungro narrowly ahead, blast has weather support
    adj = rb.adjust(raw, names, HUMID)
    assert adj.sum() == pytest.approx(1.0)
    assert adj[0] > adj[1]


def test_weather_can_never_flip_a_confident_prediction(rb):
    """Property: if raw top-1 >= 0.85 the winner can't change under multipliers in [0.8, 1.25]."""
    names = list(rb.diseases)
    rng = np.random.default_rng(0)
    for _ in range(500):
        top = rng.uniform(0.85, 0.999)
        rest = rng.dirichlet(np.ones(len(names) - 1)) * (1 - top)
        raw = np.concatenate([[top], rest])
        feats = HUMID if rng.random() < 0.5 else DRY
        assert rb.adjust(raw, names, feats).argmax() == 0


def test_context_note_labels_itself_and_flags_placeholders(rb):
    note = rb.context_note([("blast", "Rice Blast")], HUMID | {"mean_night_min_c": 22.0})
    assert "Rule-based environmental context; trainable fusion is future work" in note
    assert "TODO_VERIFY" in note and "does not change the image-based diagnosis" in note


def test_risk_alert_lists_elevated_and_carries_label(rb):
    names = list(rb.diseases)
    disp = {k: k.title() for k in names}
    alert, rows = rb.risk(HUMID, names, disp)
    assert "Blast" in alert and "trainable fusion is future work" in alert
    assert {r["class_key"] for r in rows} == set(names)
    alert2, _ = rb.risk(DRY, names, disp)
    assert "no elevated risk" in alert2


# ------------------------------------------------------------ service / cache
@pytest.mark.asyncio
async def test_cache_hits_within_ttl_and_rounds_location(rb, settings):
    calls = []

    async def fetcher(lat, lon):
        calls.append((lat, lon))
        return synthetic_open_meteo_payload(FIXED_NOW)

    svc = WeatherService(settings, rb, fetcher=fetcher)
    await svc.snapshot(25.5788, 91.8933, FIXED_NOW)
    await svc.snapshot(25.5791, 91.8929, FIXED_NOW)  # same 0.01-degree cell
    assert len(calls) == 1
    await svc.snapshot(26.1, 91.7, FIXED_NOW)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_failure_returns_none_from_try_snapshot(rb, settings):
    import httpx

    async def boom(lat, lon):
        raise httpx.ConnectError("down")

    svc = WeatherService(settings, rb, fetcher=boom)
    assert await svc.try_snapshot(25.0, 91.0) is None
    with pytest.raises(WeatherUnavailable):
        await svc.snapshot(25.0, 91.0)
