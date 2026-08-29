from __future__ import annotations

from dataclasses import dataclass

MAX_WORKFLOW_TRANSITIONS = 32


@dataclass(frozen=True)
class WorkflowNode:
    node_id: str
    label: str
    objective: str
    prompt: str
    node_type: str = "state"

    @property
    def is_terminal(self) -> bool:
        return self.node_type == "end_call"


@dataclass(frozen=True)
class WorkflowTransition:
    source_id: str
    target_id: str
    label: str
    condition: str


class WorkflowGraph:
    def __init__(self, definition: object) -> None:
        raw_definition = definition if isinstance(definition, dict) else {}
        raw_nodes = raw_definition.get("nodes", [])
        raw_edges = raw_definition.get("edges", [])
        self._nodes: dict[str, WorkflowNode] = {}
        for item in raw_nodes if isinstance(raw_nodes, list) else []:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            node_id = str(item.get("id"))
            if node_id in self._nodes:
                raise ValueError(f"workflow contains duplicate node id '{node_id}'")
            self._nodes[node_id] = WorkflowNode(
                node_id=node_id,
                label=str(item.get("label", item.get("id", ""))),
                objective=str(item.get("state", "")),
                prompt=str(item.get("prompt", "")),
                node_type=str(item.get("node_type", "state")),
            )
        if not isinstance(raw_edges, list):
            raw_edges = []
        self._edges = [
            WorkflowTransition(
                source_id=str(item.get("source_id")),
                target_id=str(item.get("target_id")),
                label=str(item.get("label", "")),
                condition=str(item.get("condition", "")),
            )
            for item in raw_edges
            if isinstance(item, dict)
            and str(item.get("source_id")) in self._nodes
            and str(item.get("target_id")) in self._nodes
        ]
        incoming = {edge.target_id for edge in self._edges}
        entry = next(
            (
                node_id
                for node_id, node in self._nodes.items()
                if not node.is_terminal and node_id not in incoming
            ),
            next((node_id for node_id, node in self._nodes.items() if not node.is_terminal), None),
        )
        self._current_node_id = entry
        self._transition_count = 0
        self._termination_started = False
        self._ended = False

    @property
    def has_nodes(self) -> bool:
        return bool(self._nodes)

    @property
    def current(self) -> WorkflowNode | None:
        return self._nodes.get(self._current_node_id or "")

    @property
    def is_terminal(self) -> bool:
        return bool(self.current and self.current.is_terminal)

    @property
    def ended(self) -> bool:
        return self._ended

    @property
    def transition_count(self) -> int:
        return self._transition_count

    @property
    def termination_started(self) -> bool:
        return self._termination_started

    def transition(self, target_id: str) -> WorkflowNode:
        if self.current is None:
            raise ValueError("workflow has no active state")
        if self.current.is_terminal:
            raise ValueError("terminal state cannot transition")
        if self._transition_count >= MAX_WORKFLOW_TRANSITIONS:
            raise ValueError("workflow transition limit reached")
        if not any(
            edge.source_id == self.current.node_id and edge.target_id == target_id
            for edge in self._edges
        ):
            raise ValueError(
                f"state '{target_id}' is not a configured transition from '{self.current.node_id}'"
            )
        self._current_node_id = target_id
        self._transition_count += 1
        next_node = self.current
        if next_node is None:
            raise ValueError("workflow target state is missing")
        return next_node

    def mark_ended(self) -> None:
        if not self.is_terminal:
            raise ValueError("workflow must reach its terminal state before ending")
        self._ended = True

    def begin_termination(self) -> bool:
        if not self.is_terminal:
            raise ValueError("workflow must reach its terminal state before ending")
        if self._termination_started or self._ended:
            return False
        self._termination_started = True
        return True

    def force_terminal(self) -> WorkflowNode:
        terminal = next((node for node in self._nodes.values() if node.is_terminal), None)
        if terminal is None:
            raise ValueError("workflow has no terminal state")
        self._current_node_id = terminal.node_id
        return terminal

    def current_instructions(self) -> str:
        node = self.current
        if node is None:
            return "No workflow state is configured."
        transitions = [
            f"- {edge.label or 'Transition'} -> {self._nodes[edge.target_id].label}: "
            f"{edge.condition or 'Use this transition when the configured condition is met.'}"
            for edge in self._edges
            if edge.source_id == node.node_id
        ]
        return "\n".join(
            [
                f"Active workflow state: {node.label}",
                f"State objective: {node.objective}",
                f"State prompt: {node.prompt}",
                "Configured next states:",
                *(transitions or ["- No transition is available."]),
            ]
        )
