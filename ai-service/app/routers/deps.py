import hmac

from fastapi import Header, HTTPException, Request


async def require_internal_key(request: Request, x_internal_key: str | None = Header(default=None)) -> None:
    expected = request.app.state.settings.internal_key
    if not x_internal_key or not hmac.compare_digest(x_internal_key.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail={"code": "unauthorized", "message": "Missing or invalid X-Internal-Key."})
