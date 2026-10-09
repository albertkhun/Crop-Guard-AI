from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.routers.deps import require_internal_key
from app.schemas import PredictResponse
from app.services.pipeline import run_prediction

router = APIRouter(dependencies=[Depends(require_internal_key)])


@router.post("/predict", response_model=PredictResponse)
async def predict(
    request: Request,
    image: UploadFile = File(...),
    lat: float | None = Form(default=None, ge=-90, le=90),
    lon: float | None = Form(default=None, ge=-180, le=180),
    crop_age_days: int | None = Form(default=None, ge=0, le=400),
    mock_scenario: str | None = Form(default=None),  # honoured only when MOCK_AI=true
):
    state = request.app.state
    if (lat is None) != (lon is None):
        raise HTTPException(422, {"code": "bad_location", "message": "Provide both lat and lon, or neither."})
    limit = state.settings.max_upload_bytes
    data = await image.read(limit + 1)  # never buffer more than limit+1 bytes
    return await run_prediction(
        state, image_bytes=data, lat=lat, lon=lon, crop_age_days=crop_age_days,
        mock_scenario=mock_scenario if state.settings.mock_ai else None)
