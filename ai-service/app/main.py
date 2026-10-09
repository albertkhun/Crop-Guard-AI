from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import Settings
from app.routers import classes, health, predict, weather
from app.services.advice import load_advice_book
from app.services.gate import load_retake_hints
from app.services.inference import ImageValidationError, ModelService, load_class_names
from app.services.mock import MockModelService, mock_fetcher
from app.services.weather_risk import WeatherService, load_rulebook

log = logging.getLogger("paddyguard")


def create_app(settings: Settings | None = None, weather_fetcher=None) -> FastAPI:
    cfg = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if not cfg.internal_key:
            raise RuntimeError("INTERNAL_KEY must be set (shared secret with the Express server).")
        # model is loaded ONCE here, never per request
        if cfg.mock_ai:
            log.warning("MOCK_AI=true: returning canned model outputs")
            model = MockModelService(load_class_names(cfg.class_names_path))
        else:
            model = ModelService.load(cfg)
        advice = load_advice_book(cfg.treatments_path, model.class_names)
        rules = load_rulebook(cfg.weather_rules_path)
        client = httpx.AsyncClient(timeout=cfg.weather_timeout_s)
        fetcher = weather_fetcher or (mock_fetcher if cfg.mock_ai else None)
        app.state.settings, app.state.model, app.state.advice, app.state.rules = cfg, model, advice, rules
        app.state.retake_hints = load_retake_hints(cfg.retake_hints_path)
        app.state.weather = WeatherService(cfg, rules, fetcher=fetcher, client=client)
        log.info("ready: model_version=%s classes=%d", model.version, len(model.class_names))
        yield
        await client.aclose()

    app = FastAPI(title="PaddyGuard AI service", version="0.1.0", lifespan=lifespan,
                  docs_url="/docs" if cfg.enable_docs else None,
                  redoc_url=None, openapi_url="/openapi.json" if cfg.enable_docs else None)

    @app.exception_handler(ImageValidationError)
    async def _img_err(_: Request, e: ImageValidationError):
        return JSONResponse(status_code=e.http_status, content={"detail": {"code": e.code, "message": e.message}})

    @app.exception_handler(RequestValidationError)
    async def _val_err(_: Request, e: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": {"code": "invalid_request",
                            "message": "; ".join(f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors())}})

    app.include_router(health.router)
    app.include_router(predict.router)
    app.include_router(weather.router)
    app.include_router(classes.router)
    return app


app = create_app()  # uvicorn app.main:app
