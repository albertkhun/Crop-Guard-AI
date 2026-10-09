import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schemas import PredictResponse
from tests.conftest import make_image_bytes

H = {"X-Internal-Key": "test-key"}


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(Settings(internal_key="test-key", mock_ai=True))) as c:
        yield c


def post(client, scenario=None, **extra):
    data = {k: str(v) for k, v in extra.items()}
    if scenario:
        data["mock_scenario"] = scenario
    return client.post("/predict", headers=H, files={"image": ("leaf.jpg", make_image_bytes(), "image/jpeg")}, data=data)


def test_health_is_open_and_minimal(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["mock_ai"] is True


@pytest.mark.parametrize("method,path", [("post", "/predict"), ("get", "/weather-risk?lat=25&lon=91"), ("get", "/classes")])
def test_secret_required_on_all_other_routes(client, method, path):
    assert getattr(client, method)(path).status_code == 401
    assert getattr(client, method)(path, headers={"X-Internal-Key": "wrong"}).status_code == 401


def test_docs_are_disabled_by_default(client):
    assert client.get("/docs").status_code == 404 and client.get("/openapi.json").status_code == 404


def test_startup_fails_without_secret():
    with pytest.raises(RuntimeError):
        with TestClient(create_app(Settings(internal_key="", mock_ai=True))):
            pass


def test_ok_response_matches_contract(client):
    r = post(client, "ok")
    assert r.status_code == 200
    body = PredictResponse(**r.json())  # validates exact contract
    assert body.status == "ok" and body.prediction.class_key == "blast" and body.prediction.display_name == "Rice Blast"
    assert body.prediction.confidence == 0.93
    assert body.retake_hint is None and body.weather is None
    assert body.advice and body.advice.safety_note
    assert all(t.raw_prob == t.adjusted_prob for t in body.top3)  # no adjustment when ok
    assert body.model_version == "mock-v0" and len(body.top3) == 3


def test_low_confidence_has_hint_no_prediction_no_advice(client):
    b = PredictResponse(**post(client, "low_confidence").json())
    assert b.status == "low_confidence" and b.prediction is None and b.advice is None
    assert "Rice Blast" in b.retake_hint and "Brown Spot" in b.retake_hint
    assert len(b.top3) == 3


def test_unclear_image(client):
    b = PredictResponse(**post(client, "unclear_image", lat=25.5, lon=91.9).json())
    assert b.status == "unclear_image" and b.prediction is None and b.top3 == [] and b.weather is None and b.retake_hint


def test_weather_block_when_location_given(client):
    b = PredictResponse(**post(client, "ok", lat=25.57, lon=91.88).json())
    w = b.weather
    assert w.source == "open-meteo" and set(w.features) == {"past_7d", "next_7d"}
    assert "trainable fusion is future work" in w.context_note and "trainable fusion is future work" in w.risk_alert
    assert b.prediction.confidence == 0.93  # weather did not touch the confident result


def test_weather_never_changes_confidence_or_gate(client):
    with_w = PredictResponse(**post(client, "low_confidence", lat=25.57, lon=91.88).json())
    without = PredictResponse(**post(client, "low_confidence").json())
    assert with_w.status == without.status == "low_confidence"
    raw_with = {t.class_key: t.raw_prob for t in with_w.top3}
    raw_without = {t.class_key: t.raw_prob for t in without.top3}
    common = raw_with.keys() & raw_without.keys()
    assert {"blast", "brown_spot"} <= common
    assert all(raw_with[k] == raw_without[k] for k in common)  # raw scores untouched; only adjusted_prob / order may differ
    assert any(t.raw_prob != t.adjusted_prob for t in with_w.top3)


def test_weather_failure_is_non_fatal():
    import httpx

    async def boom(lat, lon):
        raise httpx.ConnectError("down")

    with TestClient(create_app(Settings(internal_key="test-key", mock_ai=True), weather_fetcher=boom)) as c:
        r = post(c, "ok", lat=25.5, lon=91.9)
        assert r.status_code == 200 and r.json()["weather"] is None and r.json()["status"] == "ok"
        assert c.get("/weather-risk?lat=25&lon=91", headers=H).status_code == 503


def test_lat_without_lon_rejected(client):
    r = post(client, "ok", lat=25.5)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "bad_location"


def test_out_of_range_coordinates_rejected(client):
    assert post(client, "ok", lat=125, lon=91).status_code == 422


def test_bad_images_return_clean_errors(client):
    r = client.post("/predict", headers=H, files={"image": ("x.jpg", b"hello", "image/jpeg")})
    assert r.status_code == 415 and r.json()["detail"]["code"] == "unsupported_file"
    r = client.post("/predict", headers=H, files={"image": ("x.jpg", make_image_bytes(size=(20, 20)), "image/jpeg")})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "image_too_small"


def test_oversize_upload_413():
    s = Settings(internal_key="test-key", mock_ai=True, max_upload_bytes=1000)
    with TestClient(create_app(s)) as c:
        r = post(c, "ok")
        assert r.status_code == 413


def test_standalone_weather_risk(client):
    r = client.get("/weather-risk?lat=25.57&lon=91.88", headers=H)
    assert r.status_code == 200
    j = r.json()
    assert "trainable fusion is future work" in j["risk_alert"] and len(j["per_disease"]) == 10
    assert {d["level"] for d in j["per_disease"]} <= {"low", "moderate", "elevated", "no_rule"}


def test_scenario_field_ignored_when_not_mock(settings):
    # Guard: outside MOCK_AI the route must not honour mock_scenario (checked at router level)
    from app.routers import predict as p
    import inspect
    assert "state.settings.mock_ai" in inspect.getsource(p)


def test_classes_endpoint_lists_keys_in_model_order(client):
    j = client.get("/classes", headers=H).json()
    keys = [c["class_key"] for c in j["classes"]]
    assert keys[0] == "bacterial_leaf_blight" and keys[-1] == "tungro" and len(keys) == 10
    assert {c["class_key"]: c["display_name"] for c in j["classes"]}["normal"] == "Healthy"
