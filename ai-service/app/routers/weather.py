from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.routers.deps import require_internal_key
from app.schemas import DiseaseRisk, WeatherFeatureSet, WeatherRiskResponse
from app.services.weather_risk import WeatherUnavailable

router = APIRouter(dependencies=[Depends(require_internal_key)])


@router.get("/weather-risk", response_model=WeatherRiskResponse)
async def weather_risk(request: Request, lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)):
    st = request.app.state
    try:
        snap = await st.weather.snapshot(lat, lon)
    except WeatherUnavailable:
        raise HTTPException(503, {"code": "weather_unavailable", "message": "Weather data is unavailable right now."})
    alert, rows = st.rules.risk(snap.next, st.model.class_names, st.advice.display_names())
    return WeatherRiskResponse(
        features={"past_7d": WeatherFeatureSet(**snap.past), "next_7d": WeatherFeatureSet(**snap.next)},
        risk_alert=alert, per_disease=[DiseaseRisk(**r) for r in rows])
