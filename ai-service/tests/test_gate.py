import numpy as np
import pytest

from app.services.gate import build_retake_hint, evaluate_gate, load_retake_hints, normalized_entropy
from app.config import Settings

KW = dict(threshold=0.85, unclear_min_max_prob=0.40, unclear_max_norm_entropy=0.80)


def probs(top, second=None, n=10):
    p = np.zeros(n)
    p[0] = top
    rest = 1 - top
    if second is not None:
        p[1] = second
        rest -= second
    idx = [i for i in range(n) if p[i] == 0]
    p[idx] = rest / len(idx)
    return p


def test_confident_is_ok():
    assert evaluate_gate(probs(0.97), **KW).status == "ok"


def test_threshold_is_inclusive():
    p = np.array([0.85, 0.15] + [0.0] * 8)
    assert evaluate_gate(p, **KW).status == "ok"


def test_just_below_threshold_is_low_confidence():
    p = np.array([0.849, 0.151] + [0.0] * 8)
    assert evaluate_gate(p, **KW).status == "low_confidence"


def test_mid_confidence_is_low_confidence():
    assert evaluate_gate(probs(0.55, 0.30), **KW).status == "low_confidence"


def test_low_max_prob_is_unclear():
    assert evaluate_gate(probs(0.30, 0.25), **KW).status == "unclear_image"


def test_high_entropy_is_unclear_even_if_max_above_floor():
    # max prob 0.45 (>0.40) but spread over many classes -> entropy > 0.80
    p = np.array([0.45] + [0.55 / 9] * 9)
    g = evaluate_gate(p, **KW)
    assert g.norm_entropy > 0.80 and g.status == "unclear_image"


def test_uniform_entropy_is_one_and_certain_is_zero():
    assert normalized_entropy(np.full(10, 0.1)) == pytest.approx(1.0)
    assert normalized_entropy(np.array([1.0] + [0.0] * 9)) == pytest.approx(0.0)


def test_threshold_is_configurable():
    assert evaluate_gate(probs(0.90), threshold=0.95, unclear_min_max_prob=0.4, unclear_max_norm_entropy=0.8).status == "low_confidence"


def test_settings_validation():
    with pytest.raises(ValueError):
        Settings(internal_key="k", confidence_threshold=1.5)
    with pytest.raises(ValueError):
        Settings(internal_key="k", unclear_min_max_prob=0.9)


def test_retake_hint_merges_and_dedupes_shots(settings):
    hints = load_retake_hints(settings.retake_hints_path)
    names = {"blast": "Rice Blast", "brown_spot": "Brown Spot", "tungro": "Tungro (viral)"}
    h = build_retake_hint(["blast", "brown_spot"], names, hints)
    assert "Rice Blast or Brown Spot" in h
    assert "neck of the panicle" in h          # blast-specific shot
    assert h.count("single lesion") == 1       # shared shot appears once
    assert h.startswith("The photo could be") and "Use daylight" in h


def test_retake_hint_unknown_class_does_not_crash(settings):
    hints = load_retake_hints(settings.retake_hints_path)
    assert build_retake_hint(["mystery", "blast"], {}, hints)
