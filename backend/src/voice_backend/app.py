from contextlib import asynccontextmanager
from time import perf_counter

import psycopg
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from voice_backend.api import router as api_router
from voice_backend.config import Settings, get_settings
from voice_backend.database import configure_database
from voice_backend.logging import configure_logging, get_logger


def _check_database(settings: Settings) -> tuple[bool, str]:
    try:
        with psycopg.connect(settings.database_dsn, connect_timeout=2) as connection:
            with connection.cursor() as cursor:
                cursor.execute("select 1")
                cursor.fetchone()
        return True, "database reachable"
    except Exception as exc:  # pragma: no cover - exercised through readiness behavior
        return False, str(exc)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.service_name, resolved_settings.log_level)
    logger = get_logger(__name__)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        logger.info(
            "backend.startup",
            host=resolved_settings.host,
            port=resolved_settings.port,
        )
        yield
        logger.info("backend.shutdown")

    app = FastAPI(
        title="Voice Backend",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.settings = resolved_settings
    configure_database(app, resolved_settings)
    app.include_router(api_router)

    @app.middleware("http")
    async def add_request_timing(request, call_next):
        started_at = perf_counter()
        response = await call_next(request)
        duration_ms = (perf_counter() - started_at) * 1000
        duration_label = f"{duration_ms:.2f}"
        response.headers["X-Process-Time-Ms"] = duration_label
        response.headers["Server-Timing"] = f"app;dur={duration_label}"
        if request.url.path.startswith("/api/"):
            logger.info(
                "backend.request.completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2),
            )
        return response

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": resolved_settings.service_name}

    @app.get("/ready")
    async def ready() -> JSONResponse:
        is_ready, detail = _check_database(resolved_settings)
        payload = {
            "status": "ok" if is_ready else "degraded",
            "service": resolved_settings.service_name,
            "detail": detail,
        }
        code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
        return JSONResponse(status_code=code, content=payload)

    return app
