import pytest

from voice_pipeline.domain.workflow import MAX_WORKFLOW_TRANSITIONS, WorkflowGraph


def _graph() -> WorkflowGraph:
    return WorkflowGraph(
        {
            "nodes": [
                {"id": "entry", "label": "Entry", "state": "Start", "prompt": "Greet"},
                {"id": "confirm", "label": "Confirm", "state": "Confirm", "prompt": "Confirm"},
                {
                    "id": "end_call",
                    "label": "End call",
                    "node_type": "end_call",
                    "state": "Close",
                    "prompt": "Close",
                },
            ],
            "edges": [
                {"source_id": "entry", "target_id": "confirm", "label": "Ready"},
                {"source_id": "confirm", "target_id": "end_call", "label": "Complete"},
            ],
        }
    )


def test_workflow_graph_tracks_only_configured_transitions() -> None:
    workflow = _graph()

    assert workflow.current.node_id == "entry"
    assert "Ready -> Confirm: " in workflow.current_instructions()
    assert workflow.transition("confirm").label == "Confirm"
    assert workflow.current.node_id == "confirm"

    with pytest.raises(ValueError, match="not a configured transition"):
        workflow.transition("entry")


def test_workflow_graph_requires_terminal_state_before_ending() -> None:
    workflow = _graph()

    with pytest.raises(ValueError, match="must reach its terminal state"):
        workflow.mark_ended()

    workflow.transition("confirm")
    workflow.transition("end_call")
    assert workflow.is_terminal is True
    workflow.mark_ended()
    assert workflow.ended is True


def test_workflow_graph_rejects_duplicate_nodes() -> None:
    with pytest.raises(ValueError, match="duplicate node id 'entry'"):
        WorkflowGraph({"nodes": [{"id": "entry"}, {"id": "entry"}]})


def test_workflow_graph_bounds_configured_cycles() -> None:
    workflow = WorkflowGraph(
        {
            "nodes": [
                {"id": "entry", "label": "Entry"},
                {"id": "end_call", "label": "End call", "node_type": "end_call"},
            ],
            "edges": [
                {"source_id": "entry", "target_id": "entry", "label": "Retry"},
                {"source_id": "entry", "target_id": "end_call", "label": "Close"},
            ],
        }
    )

    for _ in range(MAX_WORKFLOW_TRANSITIONS):
        workflow.transition("entry")

    with pytest.raises(ValueError, match="transition limit reached"):
        workflow.transition("entry")
