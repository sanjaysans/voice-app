from __future__ import annotations

from typing import Any

END_CALL_NODE_ID = "end_call"
TERMINAL_EDGE_LABEL = "End call"
TERMINAL_EDGE_CONDITION = (
    "The conversation is complete, declined, or no further user input is needed."
)


def terminal_node(*, x: int = 0, y: int = 0) -> dict[str, Any]:
    return {
        "id": END_CALL_NODE_ID,
        "label": "End call",
        "x": x,
        "y": y,
        "tone": "warning",
        "node_type": "end_call",
        "state": "Generate the closing note and terminate the call",
        "prompt": (
            "Generate a concise, polite closing note that summarizes the agreed next step. "
            "Play it once, then end the call without waiting for another user turn."
        ),
        "tools": [],
        "knowledge": [],
        "vendors": {"stt": "Deepgram", "llm": "OpenAI", "tts": "Cartesia"},
    }


def normalize_flow_nodes(raw_nodes: object) -> list[dict[str, Any]]:
    nodes = (
        [dict(node) for node in raw_nodes if isinstance(node, dict)]
        if isinstance(raw_nodes, list)
        else []
    )
    normalized: list[dict[str, Any]] = []
    has_terminal = False

    for node in nodes:
        node.setdefault("node_type", "state")
        if node.get("node_type") == "end_call":
            has_terminal = True
            node.update(terminal_node(x=int(node.get("x", 0)), y=int(node.get("y", 0))))
        normalized.append(node)

    if not has_terminal:
        max_y = max((int(node.get("y", 0)) for node in normalized), default=0)
        normalized.append(terminal_node(y=max_y + 186))

    return normalized


def normalize_flow_edges(raw_edges: object, nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    node_ids = {str(node.get("id", "")) for node in nodes}
    terminal_ids = {
        str(node.get("id", "")) for node in nodes if node.get("node_type") == "end_call"
    }
    edges = raw_edges if isinstance(raw_edges, list) else []
    normalized: list[dict[str, Any]] = []
    for index, raw_edge in enumerate(edges):
        if isinstance(raw_edge, dict):
            edge = raw_edge
        elif hasattr(raw_edge, "model_dump"):
            edge = raw_edge.model_dump()
        else:
            continue
        source_id = str(edge.get("source_id", ""))
        target_id = str(edge.get("target_id", ""))
        if source_id not in node_ids or target_id not in node_ids or source_id in terminal_ids:
            continue
        normalized.append(
            {
                "id": str(edge.get("id", f"edge_{index}")),
                "source_id": source_id,
                "target_id": target_id,
                "label": str(edge.get("label", "")),
                "condition": str(edge.get("condition", "")),
            }
        )
    outgoing_sources = {edge["source_id"] for edge in normalized}
    for node in nodes:
        node_id = str(node.get("id", ""))
        if not node_id or node_id in terminal_ids or node_id in outgoing_sources:
            continue
        normalized.append(
            {
                "id": f"{node_id}_to_{END_CALL_NODE_ID}",
                "source_id": node_id,
                "target_id": END_CALL_NODE_ID,
                "label": TERMINAL_EDGE_LABEL,
                "condition": TERMINAL_EDGE_CONDITION,
            }
        )
    return normalized
