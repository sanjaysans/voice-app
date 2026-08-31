from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse

from voice_pipeline.application.planner import compile_runtime_plan, default_pipeline_blueprint
from voice_pipeline.application.session_manifest import build_session_manifest
from voice_pipeline.config import Settings, get_settings
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.infrastructure.livekit_runtime import LiveKitRuntimeValidator
from voice_pipeline.infrastructure.provider_registry import default_provider_registry
from voice_pipeline.logging import configure_logging, get_logger


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.service_name, resolved_settings.log_level)
    logger = get_logger(__name__)
    blueprint = default_pipeline_blueprint(resolved_settings)
    registry = default_provider_registry()
    plan = compile_runtime_plan(blueprint, registry)
    runtime = LiveKitRuntimeValidator(resolved_settings).describe(plan)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        logger.info(
            "pipeline.startup",
            port=resolved_settings.port,
            pipeline_mode=resolved_settings.pipeline_mode,
            livekit_configured=runtime.configured,
            livekit_startup_mode=resolved_settings.livekit_startup_mode,
            blueprint_id=blueprint.blueprint_id,
            blueprint_version=blueprint.version,
            selected_providers={
                provider_kind.value: provider.provider_id
                for provider_kind, provider in plan.selected_providers.items()
            },
        )
        yield
        logger.info("pipeline.shutdown")

    app = FastAPI(title="Voice Pipeline", version="0.1.0", lifespan=lifespan)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": resolved_settings.service_name}

    @app.get("/ready")
    async def ready() -> JSONResponse:
        payload = {
            "status": "ok" if plan.is_valid and runtime.configured else "degraded",
            "service": resolved_settings.service_name,
            "pipeline_mode": resolved_settings.pipeline_mode.value,
            "supported_pipeline_modes": [
                mode.value for mode in type(resolved_settings.pipeline_mode)
            ],
            "runtime": runtime.model_dump(mode="json"),
            "warnings": plan.warnings,
            "errors": plan.errors,
        }
        code = (
            status.HTTP_200_OK
            if plan.is_valid and runtime.configured
            else status.HTTP_503_SERVICE_UNAVAILABLE
        )
        return JSONResponse(status_code=code, content=payload)

    @app.get("/runtime/plan")
    async def runtime_plan() -> dict[str, object]:
        return {
            "blueprint": blueprint.model_dump(mode="json"),
            "plan": plan.model_dump(mode="json"),
            "runtime": runtime.model_dump(mode="json"),
        }

    @app.get("/providers")
    async def providers() -> dict[str, object]:
        return {
            "providers": [provider.model_dump(mode="json") for provider in registry.values()],
        }

    @app.post("/webrtc/session")
    async def build_webrtc_session(
        payload: ClientSessionRequest, request: Request
    ) -> dict[str, object]:
        if request.headers.get("X-Voice-Internal-Key") != resolved_settings.internal_api_key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="unauthorized")
        return build_session_manifest(resolved_settings, payload)

    return app
