from contextlib import asynccontextmanager

from fastapi import FastAPI

from voice_jobs.config import Settings, get_settings
from voice_jobs.logging import configure_logging, get_logger

REGISTERED_WORKFLOWS = [
    "post_call_processing",
    "crm_sync",
    "daily_analytics_rollup",
    "eval_suite_execution",
]


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.service_name, resolved_settings.log_level)
    logger = get_logger(__name__)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        logger.info(
            "jobs.startup",
            port=resolved_settings.port,
            temporal_target=resolved_settings.temporal_target,
            temporal_namespace=resolved_settings.temporal_namespace,
        )
        yield
        logger.info("jobs.shutdown")

    app = FastAPI(title="Voice Jobs", version="0.1.0", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": resolved_settings.service_name}

    @app.get("/ready")
    async def ready() -> dict[str, object]:
        return {
            "status": "ok",
            "service": resolved_settings.service_name,
            "temporal_target": resolved_settings.temporal_target,
            "temporal_namespace": resolved_settings.temporal_namespace,
            "registered_workflows": REGISTERED_WORKFLOWS,
        }

    return app
