"""Loads the REAL model (slow). Skipped automatically if the model file is absent."""
import numpy as np
import pytest

from app.config import Settings
from app.services.advice import load_advice_book
from app.services.inference import ModelService, load_class_names, resolve_model_version, preprocess
from PIL import Image

S = Settings(internal_key="k")
pytestmark = [pytest.mark.realmodel, pytest.mark.skipif(not S.model_path.exists(), reason="model file missing")]


@pytest.fixture(scope="module")
def svc():
    return ModelService.load(S)


def test_loads_and_matches_class_names(svc):
    assert len(svc.class_names) == 10 and svc.model.output_shape == (None, 10)
    assert svc.version == "paddy-mnv2-v1"


def test_output_is_a_probability_distribution(svc):
    rng = np.random.default_rng(0)
    out = svc.predict_batch(rng.random((3, 224, 224, 3), dtype=np.float32))
    assert out.shape == (3, 10) and np.allclose(out.sum(axis=1), 1.0, atol=1e-4) and (out >= 0).all()


def test_model_is_deterministic_in_inference(svc):
    x = np.random.default_rng(1).random((1, 224, 224, 3), dtype=np.float32)
    assert np.allclose(svc.predict_batch(x), svc.predict_batch(x))


def test_model_expects_zero_one_input(svc):
    """Guards the 'do not normalise twice' contract: [0,1] vs [-1,1] inputs must give different outputs."""
    img = Image.fromarray((np.random.default_rng(2).random((224, 224, 3)) * 255).astype("uint8"))
    x01 = preprocess(img)
    assert not np.allclose(svc.predict_batch(x01), svc.predict_batch(x01 * 2 - 1))


def test_every_model_class_has_treatments_entry(svc):
    book = load_advice_book(S.treatments_path, svc.class_names)
    assert set(book.display_names()) == set(svc.class_names)


def test_version_falls_back_to_hash(tmp_path):
    v = resolve_model_version(tmp_path / "missing.json", S.model_path)
    assert v.startswith("sha256-") and len(v) == len("sha256-") + 12
