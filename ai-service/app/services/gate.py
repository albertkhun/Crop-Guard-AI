"""Confidence gate on RAW CNN output only. Weather never touches this module."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

import numpy as np

Status = Literal["ok", "low_confidence", "unclear_image"]


@dataclass(frozen=True)
class GateResult:
    status: Status
    max_prob: float
    norm_entropy: float


def normalized_entropy(probs: Sequence[float]) -> float:
    """Shannon entropy divided by log(n): 0 = certain, 1 = uniform."""
    p = np.asarray(probs, dtype=np.float64)
    n = p.size
    if n < 2:
        return 0.0
    p = p[p > 0]
    return float(-(p * np.log(p)).sum() / math.log(n))


def evaluate_gate(probs: Sequence[float], *, threshold: float,
                  unclear_min_max_prob: float, unclear_max_norm_entropy: float) -> GateResult:
    """unclear_image is checked first, then the confidence threshold (>= passes)."""
    p = np.asarray(probs, dtype=np.float64)
    max_p = float(p.max())
    ent = normalized_entropy(p)
    if max_p < unclear_min_max_prob or ent > unclear_max_norm_entropy:
        status: Status = "unclear_image"
    elif max_p < threshold:
        status = "low_confidence"
    else:
        status = "ok"
    return GateResult(status, max_p, ent)


def load_retake_hints(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def build_retake_hint(top2_keys: Sequence[str], display_names: dict[str, str], hints: dict) -> str:
    """Hint for low_confidence, built from the raw top-2 classes. Shots are merged and de-duplicated."""
    keys = list(top2_keys[:2])
    names = [display_names.get(k, k) for k in keys]
    shots: list[str] = []
    for k in keys:
        for shot in hints.get("classes", {}).get(k, {}).get("shots", []):
            if shot not in shots:
                shots.append(shot)
    head = (f"The photo could be {names[0]} or {names[1]}, and we cannot tell them apart yet."
            if len(names) == 2 else "We are not sure what this is yet.")
    ask = ""
    if shots:
        listed = shots[0] if len(shots) == 1 else ", ".join(shots[:-1]) + ", and " + shots[-1]
        ask = f"Please upload another photo: {listed}."
    return " ".join(x for x in [head, ask, hints.get("generic", "")] if x)


def unclear_message(hints: dict) -> str:
    return hints.get("unclear", "We could not recognise a clear rice plant in this photo. Please retake it.")
