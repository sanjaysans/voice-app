import json

from voice_pipeline.application.planner import compile_runtime_plan, default_pipeline_blueprint
from voice_pipeline.config import Settings
from voice_pipeline.domain.models import PipelineBlueprint, RuntimePlan
from voice_pipeline.domain.session import ClientSessionRequest
from voice_pipeline.infrastructure.livekit_runtime import LiveKitRuntimeValidator
from voice_pipeline.infrastructure.provider_registry import default_provider_registry


def blueprint_for_client_session(
    settings: Settings,
    session_request: ClientSessionRequest,
) -> PipelineBlueprint:
    base = default_pipeline_blueprint(settings)
    metadata = dict(base.metadata)
    metadata.update(
        {
            "transport": session_request.transport,
            "session_id": session_request.session_id,
            "room_name": session_request.room.room_name,
            "dispatch_agent_name": session_request.dispatch_agent_name,
        }
    )
    return base.model_copy(
        update={
            "pipeline_mode": session_request.pipeline_mode,
            "provider_selection": session_request.provider_selection,
            "metadata": metadata,
        }
    )


def build_runtime_plan_for_client_session(
    settings: Settings,
    session_request: ClientSessionRequest,
) -> RuntimePlan:
    blueprint = blueprint_for_client_session(settings, session_request)
    return compile_runtime_plan(blueprint, default_provider_registry())


def build_session_manifest(
    settings: Settings,
    session_request: ClientSessionRequest,
) -> dict[str, object]:
    plan = build_runtime_plan_for_client_session(settings, session_request)
    runtime = LiveKitRuntimeValidator(settings).describe(plan)
    return {
        "session": session_request.sanitized_summary(),
        "dispatch_agent_name": session_request.dispatch_agent_name,
        "dispatch_metadata": session_request.to_worker_metadata(),
        "runtime": runtime.model_dump(mode="json"),
        "warnings": plan.warnings,
        "errors": plan.errors,
    }


def parse_session_request_metadata(metadata: str) -> ClientSessionRequest:
    return ClientSessionRequest.model_validate(json.loads(metadata))
