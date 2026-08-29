import pytest

from voice_backend.services.agent_config import (
    END_CALL_NODE_ID,
    normalize_flow_edges,
    normalize_flow_nodes,
)
from voice_backend.services.live_test_session import (
    _build_workflow_prompt,
    _render_prompt,
    _render_workflow,
    _resolve_variable_inputs,
)


def test_flow_normalization_adds_terminal_node_and_leaf_edge() -> None:
    nodes = normalize_flow_nodes(
        [{"id": "entry", "label": "Entry", "x": 0, "y": 0, "prompt": "Hello"}]
    )

    edges = normalize_flow_edges([], nodes)

    assert nodes[-1]["id"] == END_CALL_NODE_ID
    assert edges == [
        {
            "id": "entry_to_end_call",
            "source_id": "entry",
            "target_id": END_CALL_NODE_ID,
            "label": "End call",
            "condition": "The conversation is complete, declined, or no further user input is needed.",
        }
    ]


def test_flow_normalization_removes_terminal_outgoing_edges() -> None:
    nodes = normalize_flow_nodes(
        [
            {"id": "entry", "label": "Entry", "x": 0, "y": 0},
            {
                "id": END_CALL_NODE_ID,
                "label": "Old terminal",
                "x": 0,
                "y": 200,
                "node_type": "end_call",
            },
        ]
    )

    edges = normalize_flow_edges(
        [
            {"id": "valid", "source_id": "entry", "target_id": END_CALL_NODE_ID},
            {"id": "invalid", "source_id": END_CALL_NODE_ID, "target_id": "entry"},
        ],
        nodes,
    )

    assert [edge["id"] for edge in edges] == ["valid"]


def test_variable_inputs_apply_defaults_and_render_prompt_tokens() -> None:
    definitions = [
        {"key": "farmer_name", "label": "Farmer name", "required": True},
        {
            "key": "crate_count",
            "label": "Crate count",
            "data_type": "number",
            "default_value": 10,
        },
    ]

    values = _resolve_variable_inputs(definitions, {"farmer_name": "Ravi"})
    prompt = _build_workflow_prompt(
        "Be concise to {{farmer_name}}.",
        "Qualify the caller.",
        [
            {
                "id": "entry",
                "label": "Entry",
                "state": "Greet {{farmer_name}}",
                "prompt": "Ask about {{crate_count}} crates.",
                "node_type": "state",
            }
        ],
        [],
        definitions,
        values,
    )

    assert values == {"farmer_name": "Ravi", "crate_count": 10}
    assert "Be concise to Ravi." in prompt
    assert "Ask about 10 crates." in prompt
    assert "farmer_name (text, Farmer name): Ravi" in prompt


def test_render_workflow_resolves_state_and_transition_tokens() -> None:
    rendered = _render_workflow(
        [{"id": "entry", "state": "Greet {{name}}", "prompt": "Ask {{topic}}."}],
        [
            {
                "id": "edge",
                "source_id": "entry",
                "target_id": "end_call",
                "condition": "Use after {{name}} confirms {{topic}}.",
            }
        ],
        {"name": "Ravi", "topic": "harvest"},
    )

    assert rendered["nodes"][0]["prompt"] == "Ask harvest."
    assert rendered["edges"][0]["condition"] == "Use after Ravi confirms harvest."


def test_render_prompt_does_not_leak_missing_optional_tokens() -> None:
    assert _render_prompt("Hello {{name}}.", {}) == "Hello ."


def test_required_variable_inputs_fail_closed() -> None:
    try:
        _resolve_variable_inputs(
            [{"key": "farmer_name", "label": "Farmer name", "required": True}], {}
        )
    except ValueError as error:
        assert "required agent variable 'farmer_name' is missing" in str(error)
    else:
        raise AssertionError("missing required variable should fail")


def test_variable_inputs_validate_enum_and_iso_dates() -> None:
    definitions = [
        {
            "key": "lead_type",
            "label": "Lead type",
            "data_type": "enum",
            "options": ["new", "returning"],
        },
        {"key": "callback_date", "label": "Callback date", "data_type": "date"},
    ]

    assert _resolve_variable_inputs(
        definitions, {"lead_type": "returning", "callback_date": "2026-08-29"}
    ) == {"lead_type": "returning", "callback_date": "2026-08-29"}

    try:
        _resolve_variable_inputs(definitions, {"lead_type": "unknown"})
    except ValueError as error:
        assert "must be one of" in str(error)
    else:
        raise AssertionError("invalid enum should fail")


def test_prompt_rejects_undeclared_variable_tokens() -> None:
    with pytest.raises(ValueError, match="undeclared agent variables: missing_name"):
        _build_workflow_prompt(
            "Welcome {{missing_name}}.",
            "",
            [],
            [],
            [],
            {},
        )
