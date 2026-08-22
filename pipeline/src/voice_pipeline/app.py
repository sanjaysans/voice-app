from contextlib import asynccontextmanager

from fastapi import FastAPI

from voice_pipeline.config import Settings, get_settings
from voice_pipeline.logging import configure_logging, get_logger

SUPPORTED_PIPELINE_MODES = [
    "realtime_s2s",
    "stt_llm_tts",
    "stt_realtime",
    "text_llm_tts",
]


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.service_name, resolved_settings.log_level)
    logger = get_logger(__name__)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        logger.info(
            "pipeline.startup",
            port=resolved_settings.port,
            pipeline_mode=resolved_settings.pipeline_mode,
            livekit_configured=bool(resolved_settings.livekit_url),
        )
        yield
        logger.info("pipeline.shutdown")

    app = FastAPI(title="Voice Pipeline", version="0.1.0", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": resolved_settings.service_name}

    @app.get("/ready")
    async def ready() -> dict[str, object]:
        return {
            "status": "ok",
            "service": resolved_settings.service_name,
            "pipeline_mode": resolved_settings.pipeline_mode,
            "supported_pipeline_modes": SUPPORTED_PIPELINE_MODES,
            "livekit_configured": bool(resolved_settings.livekit_url),
        }

    return app
