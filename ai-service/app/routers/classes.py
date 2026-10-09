from fastapi import APIRouter, Depends, Request

from app.routers.deps import require_internal_key
from app.schemas import ClassesResponse, ClassInfo

router = APIRouter(dependencies=[Depends(require_internal_key)])


@router.get("/classes", response_model=ClassesResponse)
async def classes(request: Request):
    st = request.app.state
    disp = st.advice.display_names()
    return ClassesResponse(classes=[ClassInfo(class_key=k, display_name=disp[k]) for k in st.model.class_names],
                           model_version=st.model.version)
