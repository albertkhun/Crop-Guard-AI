from fastapi import APIRouter, Request

from app.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request):
    st = request.app.state
    return HealthResponse(status="ok", model_loaded=st.model is not None,
                          mock_ai=st.settings.mock_ai, model_version=st.model.version)
