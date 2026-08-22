import pytest

from voice_pipeline.domain.models import (
    AgentBlueprint,
    HandoffPolicy,
    PipelineBlueprint,
    PipelineMode,
    ProviderSelection,
    TurnPolicy,
)


def _base_blueprint() -> dict[str, object]:
    return {
        "blueprint_id": "voice-test",
        "version": "v1",
        "pipeline_mode": PipelineMode.STT_LLM_TTS,
        "root_agent_id": "router",
        "provider_selection": ProviderSelection(),
        "turn_policy": TurnPolicy(),
        "handoff_policy": HandoffPolicy(),
        "agents": [
            AgentBlueprint(
                agent_id="router",
                name="Router",
                role="intent-router",
                prompt_summary="Routes traffic.",
                downstream_agent_ids=["specialist"],
            ),
            AgentBlueprint(
                agent_id="specialist",
                name="Specialist",
                role="specialist",
                prompt_summary="Handles the routed task.",
            ),
        ],
    }


def test_pipeline_blueprint_rejects_unknown_root_agent() -> None:
    blueprint = _base_blueprint()
    blueprint["root_agent_id"] = "missing"

    with pytest.raises(ValueError, match="root agent 'missing'"):
        PipelineBlueprint(**blueprint)


def test_pipeline_blueprint_rejects_duplicate_agent_ids() -> None:
    blueprint = _base_blueprint()
    blueprint["agents"] = [
        AgentBlueprint(
            agent_id="router",
            name="Router",
            role="intent-router",
            prompt_summary="Routes traffic.",
        ),
        AgentBlueprint(
            agent_id="router",
            name="Duplicate",
            role="specialist",
            prompt_summary="Duplicate agent id.",
        ),
    ]

    with pytest.raises(ValueError, match="agent ids must be unique"):
        PipelineBlueprint(**blueprint)


def test_pipeline_blueprint_rejects_missing_downstream_agent() -> None:
    blueprint = _base_blueprint()
    blueprint["agents"] = [
        AgentBlueprint(
            agent_id="router",
            name="Router",
            role="intent-router",
            prompt_summary="Routes traffic.",
            downstream_agent_ids=["missing"],
        )
    ]

    with pytest.raises(ValueError, match="downstream agents are not defined"):
        PipelineBlueprint(**blueprint)
