"use client";

import { useEffect, useMemo, useRef } from "react";
import type { FlowEdge } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type BuilderNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  tone: "neutral" | "success" | "warning";
  nodeType?: "state" | "end_call";
  state: string;
};

type CanvasProps = {
  nodes: BuilderNode[];
  edges: FlowEdge[];
  selectedId: string;
  onMoveNode?: (id: string, position: { x: number; y: number }) => void;
  onSelect: (id: string) => void;
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 132;
const CANVAS_PADDING = 56;
const MIN_CANVAS_WIDTH = 900;
const MIN_CANVAS_HEIGHT = 560;
const COLUMN_GAP = 320;
const ROW_GAP = 186;

type PositionedNode = BuilderNode & {
  left: number;
  top: number;
  centerX: number;
  centerY: number;
  right: number;
  bottom: number;
};

type DragState = {
  id: string;
  startClientX: number;
  startClientY: number;
  startNodeX: number;
  startNodeY: number;
  moved: boolean;
};

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function autoArrangeFlowNodes<T extends BuilderNode>(nodes: T[], edges: FlowEdge[]): T[] {
  if (!nodes.length) {
    return [];
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const validEdges = edges.filter(
    (edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)
  );

  if (!validEdges.length) {
    return nodes.map((node, index) => ({
      ...node,
      x: 0,
      y: index * ROW_GAP,
    }));
  }

  const layoutEdges: FlowEdge[] = [];
  const layoutAdjacency = new Map<string, string[]>();

  for (const node of nodes) {
    layoutAdjacency.set(node.id, []);
  }

  function reaches(startId: string, targetId: string) {
    const queue = [startId];
    const visited = new Set<string>();
    while (queue.length) {
      const currentId = queue.shift() as string;
      if (currentId === targetId) {
        return true;
      }
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      queue.push(...(layoutAdjacency.get(currentId) ?? []));
    }
    return false;
  }

  for (const edge of validEdges) {
    if (edge.sourceId === edge.targetId || reaches(edge.targetId, edge.sourceId)) {
      continue;
    }
    layoutEdges.push(edge);
    layoutAdjacency.get(edge.sourceId)?.push(edge.targetId);
  }

  const incomingByNode = new Map<string, string[]>();
  const outgoingByNode = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const depth = new Map<string, number>();

  for (const node of nodes) {
    incomingByNode.set(node.id, []);
    outgoingByNode.set(node.id, []);
    indegree.set(node.id, 0);
    depth.set(node.id, 0);
  }

  for (const edge of layoutEdges) {
    incomingByNode.get(edge.targetId)?.push(edge.sourceId);
    outgoingByNode.get(edge.sourceId)?.push(edge.targetId);
    indegree.set(edge.targetId, (indegree.get(edge.targetId) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((node) => node.id);

  const visited = new Set<string>();

  while (queue.length) {
    const currentId = queue.shift() as string;
    visited.add(currentId);
    const currentDepth = depth.get(currentId) ?? 0;

    for (const targetId of outgoingByNode.get(currentId) ?? []) {
      depth.set(targetId, Math.max(depth.get(targetId) ?? 0, currentDepth + 1));
      indegree.set(targetId, (indegree.get(targetId) ?? 0) - 1);
      if ((indegree.get(targetId) ?? 0) <= 0) {
        queue.push(targetId);
      }
    }
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      depth.set(node.id, Math.max(depth.get(node.id) ?? 0, 0));
    }
  }

  const columns = new Map<number, BuilderNode[]>();
  for (const node of nodes) {
    const nodeDepth = depth.get(node.id) ?? 0;
    columns.set(nodeDepth, [...(columns.get(nodeDepth) ?? []), node]);
  }

  const rows = new Map<string, number>();
  const sortedDepths = [...columns.keys()].sort((left, right) => left - right);

  for (const columnDepth of sortedDepths) {
    const columnNodes = columns.get(columnDepth) ?? [];
    const desired = columnNodes
      .map((node, index) => {
        const parentRows = (incomingByNode.get(node.id) ?? [])
          .map((parentId) => rows.get(parentId))
          .filter((value): value is number => typeof value === "number");
        return {
          node,
          preferredRow: parentRows.length ? average(parentRows) : index,
        };
      })
      .sort(
        (left, right) =>
          left.preferredRow - right.preferredRow ||
          left.node.y - right.node.y ||
          left.node.x - right.node.x
      );

    let lastAssignedRow = Number.NEGATIVE_INFINITY;
    for (const item of desired) {
      const roundedPreferred = Math.round(item.preferredRow);
      const assignedRow = Math.max(roundedPreferred, lastAssignedRow + 1);
      rows.set(item.node.id, assignedRow);
      lastAssignedRow = assignedRow;
    }
  }

  const rowValues = [...rows.values()];
  const minRow = rowValues.length ? Math.min(...rowValues) : 0;

  return nodes.map((node) => ({
    ...node,
    x: ((rows.get(node.id) ?? 0) - minRow) * COLUMN_GAP,
    y: (depth.get(node.id) ?? 0) * ROW_GAP,
  }));
}

function buildCanvasLayout(nodes: BuilderNode[]) {
  if (!nodes.length) {
    return {
      nodes: [] as PositionedNode[],
      width: MIN_CANVAS_WIDTH,
      height: MIN_CANVAS_HEIGHT,
    };
  }

  const positioned = nodes.map((node) => {
    const left = node.x + CANVAS_PADDING;
    const top = node.y + CANVAS_PADDING;
    return {
      ...node,
      left,
      top,
      centerX: left + NODE_WIDTH / 2,
      centerY: top + NODE_HEIGHT / 2,
      right: left + NODE_WIDTH,
      bottom: top + NODE_HEIGHT,
    };
  });

  const maxRight = Math.max(...positioned.map((node) => node.right));
  const maxBottom = Math.max(...positioned.map((node) => node.bottom));

  return {
    nodes: positioned,
    width: Math.max(MIN_CANVAS_WIDTH, maxRight + CANVAS_PADDING),
    height: Math.max(MIN_CANVAS_HEIGHT, maxBottom + CANVAS_PADDING),
  };
}

function roundedPolyline(points: Array<{ x: number; y: number }>, radius = 18) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];

    if (!next) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const incomingDx = current.x - previous.x;
    const incomingDy = current.y - previous.y;
    const outgoingDx = next.x - current.x;
    const outgoingDy = next.y - current.y;
    const incomingLength = Math.hypot(incomingDx, incomingDy);
    const outgoingLength = Math.hypot(outgoingDx, outgoingDy);

    if (!incomingLength || !outgoingLength) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const turnRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const startX = current.x - (incomingDx / incomingLength) * turnRadius;
    const startY = current.y - (incomingDy / incomingLength) * turnRadius;
    const endX = current.x + (outgoingDx / outgoingLength) * turnRadius;
    const endY = current.y + (outgoingDy / outgoingLength) * turnRadius;

    path += ` L ${startX} ${startY} Q ${current.x} ${current.y} ${endX} ${endY}`;
  }

  return path;
}

function edgeOffset(index: number, total: number, spacing = 20) {
  return (index - (total - 1) / 2) * spacing;
}

function buildEdgeRoute(
  source: PositionedNode,
  target: PositionedNode,
  sourceIndex: number,
  sourceTotal: number,
  targetIndex: number,
  targetTotal: number
) {
  const sourceY = source.centerY + edgeOffset(sourceIndex, sourceTotal);
  const targetY = target.centerY + edgeOffset(targetIndex, targetTotal);
  const isBackEdge = target.centerY < source.centerY - NODE_HEIGHT / 2;

  if (isBackEdge) {
    const laneX = Math.max(source.right, target.right) + 56 + Math.max(sourceIndex, targetIndex) * 24;
    return {
      path: roundedPolyline([
        { x: source.right, y: sourceY },
        { x: laneX, y: sourceY },
        { x: laneX, y: targetY },
        { x: target.right, y: targetY },
      ]),
      labelX: laneX,
      labelY: (sourceY + targetY) / 2 - 10,
    };
  }

  const dx = target.centerX - source.centerX;
  const dy = targetY - sourceY;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);

  if (isHorizontal) {
    const movingRight = dx >= 0;
    const start = {
      x: movingRight ? source.right : source.left,
      y: sourceY,
    };
    const end = {
      x: movingRight ? target.left : target.right,
      y: targetY,
    };
    const midpointX = start.x + (end.x - start.x) / 2;

    return {
      path: roundedPolyline([
        start,
        { x: midpointX, y: start.y },
        { x: midpointX, y: end.y },
        end,
      ]),
      labelX: midpointX,
      labelY: start.y + (end.y - start.y) / 2 - 10,
    };
  }

  const movingDown = dy >= 0;
  const start = {
    x: source.centerX,
    y: movingDown ? source.bottom : source.top,
  };
  const end = {
    x: target.centerX,
    y: movingDown ? target.top : target.bottom,
  };
  const midpointY = start.y + (end.y - start.y) / 2;

  return {
    path: roundedPolyline([
      start,
      { x: start.x, y: midpointY },
      { x: end.x, y: midpointY },
      end,
    ]),
    labelX: start.x + (end.x - start.x) / 2,
    labelY: midpointY - 10,
  };
}

export function AgentFlowCanvas({
  nodes,
  edges,
  selectedId,
  onMoveNode,
  onSelect,
}: CanvasProps) {
  const layout = useMemo(() => buildCanvasLayout(nodes), [nodes]);
  const nodesById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes]
  );
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  const outgoingEdges = useMemo(() => {
    const grouped = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
      grouped.set(edge.sourceId, [...(grouped.get(edge.sourceId) ?? []), edge]);
    }
    for (const [nodeId, nodeEdges] of grouped) {
      const source = nodesById.get(nodeId);
      if (!source) {
        continue;
      }
      grouped.set(
        nodeId,
        [...nodeEdges].sort((left, right) => {
          const leftTarget = nodesById.get(left.targetId);
          const rightTarget = nodesById.get(right.targetId);
          return (leftTarget?.centerY ?? source.centerY) - (rightTarget?.centerY ?? source.centerY);
        })
      );
    }
    return grouped;
  }, [edges, nodesById]);

  const incomingEdges = useMemo(() => {
    const grouped = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
      grouped.set(edge.targetId, [...(grouped.get(edge.targetId) ?? []), edge]);
    }
    for (const [nodeId, nodeEdges] of grouped) {
      const target = nodesById.get(nodeId);
      if (!target) {
        continue;
      }
      grouped.set(
        nodeId,
        [...nodeEdges].sort((left, right) => {
          const leftSource = nodesById.get(left.sourceId);
          const rightSource = nodesById.get(right.sourceId);
          return (leftSource?.centerY ?? target.centerY) - (rightSource?.centerY ?? target.centerY);
        })
      );
    }
    return grouped;
  }, [edges, nodesById]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState || !onMoveNode) {
        return;
      }

      const deltaX = event.clientX - dragState.startClientX;
      const deltaY = event.clientY - dragState.startClientY;

      if (!dragState.moved && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
        dragState.moved = true;
        suppressClickRef.current = dragState.id;
      }

      if (!dragState.moved) {
        return;
      }

      onMoveNode(dragState.id, {
        x: Math.max(0, Math.round(dragState.startNodeX + deltaX)),
        y: Math.max(0, Math.round(dragState.startNodeY + deltaY)),
      });
    }

    function handlePointerUp() {
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onMoveNode]);

  return (
    <div className="relative h-full w-full overflow-auto scrollbar-subtle">
      <div
        className="relative"
        style={{
          minWidth: `${layout.width}px`,
          minHeight: `${layout.height}px`,
        }}
      >
        <svg
          className="pointer-events-none absolute left-0 top-0"
          height={layout.height}
          preserveAspectRatio="none"
          width={layout.width}
        >
          <defs>
            <marker
              id="state-transition-arrow"
              markerHeight="10"
              markerUnits="userSpaceOnUse"
              markerWidth="10"
              orient="auto"
              refX="8"
              refY="5"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(102, 89, 255, 0.56)" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const source = nodesById.get(edge.sourceId);
            const target = nodesById.get(edge.targetId);

            if (!source || !target) {
              return null;
            }

            const sourceEdges = outgoingEdges.get(edge.sourceId) ?? [edge];
            const targetEdges = incomingEdges.get(edge.targetId) ?? [edge];
            const route = buildEdgeRoute(
              source,
              target,
              Math.max(sourceEdges.findIndex((item) => item.id === edge.id), 0),
              sourceEdges.length,
              Math.max(targetEdges.findIndex((item) => item.id === edge.id), 0),
              targetEdges.length
            );

            return (
              <g key={edge.id}>
                <path
                  d={route.path}
                  fill="none"
                  markerEnd="url(#state-transition-arrow)"
                  stroke="rgba(102, 89, 255, 0.42)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="3"
                />
                {edge.label ? (
                  <g>
                    <rect
                      fill="rgba(255,255,255,0.96)"
                      height="26"
                      rx="13"
                      stroke="rgba(102,89,255,0.12)"
                      width="108"
                      x={route.labelX - 54}
                      y={route.labelY - 16}
                    />
                    <text
                      fill="rgba(76, 70, 182, 0.92)"
                      fontSize="12"
                      fontWeight="600"
                      textAnchor="middle"
                      x={route.labelX}
                      y={route.labelY}
                    >
                      {edge.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>

        {layout.nodes.map((node) => (
          <button
            key={node.id}
            className={cn(
              "absolute w-[220px] cursor-grab rounded-2xl border bg-white p-4 text-left shadow-sm transition active:cursor-grabbing",
              node.nodeType === "end_call"
                ? "border-[rgba(217,119,6,0.3)] bg-[rgba(217,119,6,0.06)]"
                : selectedId === node.id
                ? "border-[rgba(102,89,255,0.35)] bg-[rgba(102,89,255,0.08)] shadow-surface"
                : "border-border hover:border-[rgba(102,89,255,0.2)]"
            )}
            onClick={(event) => {
              if (suppressClickRef.current === node.id) {
                suppressClickRef.current = null;
                event.preventDefault();
                return;
              }
              onSelect(node.id);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              onSelect(node.id);
              dragStateRef.current = {
                id: node.id,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startNodeX: node.x,
                startNodeY: node.y,
                moved: false,
              };
            }}
            style={{ left: node.left, top: node.top }}
            type="button"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">
              {node.nodeType === "end_call"
                ? "Terminal"
                : node.id === "router"
                  ? "Router"
                  : node.id === "escalation"
                    ? "Human handoff"
                    : "Workflow step"}
            </p>
            <h3 className="mt-2 text-base font-semibold">{node.label}</h3>
            <p className="mt-3 text-sm text-[#6D6D78]">{node.state}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
