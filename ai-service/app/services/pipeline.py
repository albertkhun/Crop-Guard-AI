"""POST /predict orchestration. The order of operations here encodes the honesty rules:
1) gate on RAW CNN output, 2) weather only annotates / reorders close calls, never gates."""
from __future__ import annotations

import numpy as np
from starlette.concurrency import run_in_threadpool

from app.schemas import Advice, PredictResponse, Prediction, Top3Item, WeatherBlock, WeatherFeatureSet
from app.services.gate import build_retake_hint, evaluate_gate, unclear_message
from app.services.inference import preprocess, validate_and_decode


def _r(x: float) -> float:
    return round(float(x), 4)


async def run_prediction(state, *, image_bytes: bytes, lat: float | None, lon: float | None,
                         crop_age_days: int | None, mock_scenario: str | None) -> PredictResponse:
    s, names = state.settings, state.model.class_names
    display = state.advice.display_names()

    img = await run_in_threadpool(validate_and_decode, image_bytes, s)
    batch = await run_in_threadpool(preprocess, img, s.resize_backend)
    raw = await run_in_threadpool(state.model.predict, batch, mock_scenario)
    raw = np.asarray(raw, dtype=np.float64)

    gate = evaluate_gate(raw, threshold=s.confidence_threshold,
                         unclear_min_max_prob=s.unclear_min_max_prob,
                         unclear_max_norm_entropy=s.unclear_max_norm_entropy)
    base = dict(model_version=state.model.version)

    if gate.status == "unclear_image":
        return PredictResponse(status="unclear_image", prediction=None, top3=[],
                               retake_hint=unclear_message(state.retake_hints), advice=None, weather=None, **base)

    # weather is optional context; it can fail without failing the request
    snap = await state.weather.try_snapshot(lat, lon) if (lat is not None and lon is not None) else None

    raw_order = np.argsort(-raw)
    adjusted = raw
    if gate.status == "low_confidence" and snap is not None:
        adjusted = state.rules.adjust(raw, names, snap.past)  # reorder close calls only
    order = np.argsort(-adjusted)[:3]
    top3 = [Top3Item(class_key=names[i], display_name=display[names[i]],
                     raw_prob=_r(raw[i]), adjusted_prob=_r(adjusted[i])) for i in order]

    top_key = names[raw_order[0]]
    cand_keys = [names[i] for i in raw_order[: (1 if gate.status == "ok" else 2)]]

    weather = None
    if snap is not None:
        note = state.rules.context_note([(k, display[k]) for k in cand_keys], snap.past)
        alert, _ = state.rules.risk(snap.next, names, display)
        weather = WeatherBlock(
            features={"past_7d": WeatherFeatureSet(**snap.past), "next_7d": WeatherFeatureSet(**snap.next)},
            context_note=note, risk_alert=alert)

    if gate.status == "low_confidence":
        hint = build_retake_hint(cand_keys, display, state.retake_hints)
        return PredictResponse(status="low_confidence", prediction=None, top3=top3, retake_hint=hint,
                               advice=None, weather=weather, **base)

    return PredictResponse(
        status="ok",
        prediction=Prediction(class_key=top_key, display_name=display[top_key], confidence=_r(raw[raw_order[0]])),
        top3=top3, retake_hint=None, advice=Advice(**state.advice.advice(top_key)), weather=weather, **base)
