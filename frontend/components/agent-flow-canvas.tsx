"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
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
const BACK_LANE_SPACING = 120;
const BACK_LABEL_OFFSET = 62;
const ADJACENT_LANE_GAP = 30;
const ROUTE_STUB_LANE_GAP = 36;

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
        const nodeDepth = depth.get(node.id) ?? 0;
        const hasLongRangeParent = (incomingByNode.get(node.id) ?? []).some(
          (parentId) => (depth.get(parentId) ?? 0) < nodeDepth - 1
        );
        const hasMultipleParents = parentRows.length > 1 && node.nodeType !== "end_call";
        return {
          node,
          preferredRow: parentRows.length
            ? average(parentRows) + (hasLongRangeParent || hasMultipleParents ? 2 : 0)
            : index,
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

function buildCanvasLayout(nodes: BuilderNode[], edges: FlowEdge[]) {
  if (!nodes.length) {
    return {
      nodes: [] as PositionedNode[],
      width: MIN_CANVAS_WIDTH,
      height: MIN_CANVAS_HEIGHT,
      routeLaneBase: 0,
    };
  }

  const backEdgeCount = edges.filter((edge) => {
    const source = nodes.find((node) => node.id === edge.sourceId);
    const target = nodes.find((node) => node.id === edge.targetId);
    return source && target && target.y < source.y;
  }).length;
  const backGutter = backEdgeCount ? 200 + (backEdgeCount - 1) * BACK_LANE_SPACING : 0;
  const positioned = nodes.map((node) => {
    const left = node.x + CANVAS_PADDING + backGutter;
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
  const routeLaneBase = maxRight + 64;
  const routeClearance = edges.length ? 96 + edges.length * 28 : 0;

  return {
    nodes: positioned,
    width: Math.max(MIN_CANVAS_WIDTH, maxRight + CANVAS_PADDING + routeClearance),
    height: Math.max(MIN_CANVAS_HEIGHT, maxBottom + CANVAS_PADDING + routeClearance),
    routeLaneBase,
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
  targetTotal: number,
  routeIndex: number,
  routeLaneBase: number,
  sourceStubY: number,
  targetStubY: number,
  backEdgeIndex: number,
  backEdgeCount: number,
  adjacentLaneY?: number
) {
  const sourcePortX =
    source.left + (NODE_WIDTH * (sourceIndex + 1)) / (sourceTotal + 1);
  const targetPortX =
    target.left + (NODE_WIDTH * (targetIndex + 1)) / (targetTotal + 1);
  const sourcePortY = source.centerY + edgeOffset(sourceIndex, sourceTotal);
  const targetPortY = target.centerY + edgeOffset(targetIndex, targetTotal);
  const isBackEdge = target.centerY < source.centerY - NODE_HEIGHT / 2;

  if (isBackEdge) {
    const laneX = 18 + Math.min(backEdgeIndex, Math.max(0, backEdgeCount - 1)) * BACK_LANE_SPACING;
    return {
      path: roundedPolyline([
        { x: source.left, y: sourcePortY },
        { x: source.left - 16, y: sourcePortY },
        { x: laneX, y: sourcePortY },
        { x: laneX, y: targetPortY },
        { x: target.left - 16, y: targetPortY },
        { x: target.left, y: targetPortY },
      ]),
      labelX: laneX + BACK_LABEL_OFFSET,
      labelY: (sourcePortY + targetPortY) / 2 + 4,
    };
  }

  const verticalGap = target.top - source.bottom;
  const isAdjacentForwardEdge =
    verticalGap > 24 &&
    verticalGap <= ROW_GAP + 56 &&
    adjacentLaneY !== undefined;

  if (isAdjacentForwardEdge) {
    const availableGap = Math.max(0, verticalGap - 28);
    const maxOffset = availableGap / 2;
    const staggerOffset = ((routeIndex % 5) - 2) * 10;
    const laneY =
      adjacentLaneY ??
      ((source.bottom + target.top) / 2 +
        Math.max(-maxOffset, Math.min(maxOffset, staggerOffset)));
    return {
      path: roundedPolyline([
        { x: sourcePortX, y: source.bottom },
        { x: sourcePortX, y: laneY },
        { x: targetPortX, y: laneY },
        { x: targetPortX, y: target.top },
      ]),
      labelX: (sourcePortX + targetPortX) / 2,
      labelY: laneY + 4,
    };
  }

  const laneX = routeLaneBase + routeIndex * 28;

  return {
    path: roundedPolyline([
      { x: sourcePortX, y: source.bottom },
      { x: sourcePortX, y: sourceStubY },
      { x: laneX, y: sourceStubY },
      { x: laneX, y: targetStubY },
      { x: targetPortX, y: targetStubY },
      { x: targetPortX, y: target.top },
    ]),
    labelX: (sourcePortX + laneX) / 2,
    labelY: sourceStubY + 4,
  };
}

function transitionLabelWidth(label: string) {
  return Math.min(320, Math.max(104, label.length * 6.5 + 28));
}

export function AgentFlowCanvas({
  nodes,
  edges,
  selectedId,
  onMoveNode,
  onSelect,
}: CanvasProps) {
  const layout = useMemo(() => buildCanvasLayout(nodes, edges), [edges, nodes]);
  const [zoom, setZoom] = useState(1);
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

  const adjacentLanePositions = useMemo(() => {
    const candidates: Array<{
      edge: FlowEdge;
      preferred: number;
      min: number;
      max: number;
      band: string;
    }> = [];

    for (const edge of edges) {
      const source = nodesById.get(edge.sourceId);
      const target = nodesById.get(edge.targetId);
      if (!source || !target) {
        continue;
      }
      const verticalGap = target.top - source.bottom;
      if (verticalGap <= 24 || verticalGap > ROW_GAP + 56) {
        continue;
      }
      candidates.push({
        edge,
        preferred: (source.bottom + target.top) / 2,
        min: source.bottom + 14,
        max: target.top - 14,
        band: `${source.bottom}:${target.top}`,
      });
    }

    const positions = new Map<string, number>();
    const usedLanes: number[] = [];
    const bandCounts = new Map<string, number>();
    const bandRanges = new Map<string, { min: number; max: number }>();
    for (const candidate of candidates) {
      bandCounts.set(candidate.band, (bandCounts.get(candidate.band) ?? 0) + 1);
      bandRanges.set(candidate.band, { min: candidate.min, max: candidate.max });
    }
    const safeCandidates = candidates.filter((candidate) => {
      const range = bandRanges.get(candidate.band);
      const count = bandCounts.get(candidate.band) ?? 0;
      return range && range.max - range.min >= (count - 1) * ADJACENT_LANE_GAP;
    });
    const isAvailable = (option: number, candidate: (typeof candidates)[number]) =>
      option >= candidate.min &&
      option <= candidate.max &&
      usedLanes.every((usedLane) => Math.abs(usedLane - option) >= ADJACENT_LANE_GAP);

    for (const candidate of safeCandidates.sort(
      (left, right) => left.preferred - right.preferred || left.edge.id.localeCompare(right.edge.id)
    )) {
      const boundedPreferred = Math.max(candidate.min, Math.min(candidate.max, candidate.preferred));
      let laneY = boundedPreferred;

      for (let distance = 0; distance <= layout.height; distance += ADJACENT_LANE_GAP) {
        const options = distance === 0
          ? [boundedPreferred]
          : [boundedPreferred - distance, boundedPreferred + distance];
        const available = options.find((option) => isAvailable(option, candidate));
        if (available !== undefined) {
          laneY = available;
          break;
        }
      }

      if (!isAvailable(laneY, candidate)) {
        continue;
      }

      usedLanes.push(laneY);
      positions.set(candidate.edge.id, laneY);
    }
    return positions;
  }, [edges, layout.height, nodesById]);

  const backEdges = useMemo(
    () => edges.filter((edge) => {
      const source = nodesById.get(edge.sourceId);
      const target = nodesById.get(edge.targetId);
      return source && target && target.centerY < source.centerY - NODE_HEIGHT / 2;
    }),
    [edges, nodesById]
  );

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

  const edgeStubPositions = useMemo(() => {
    const usedPositions: number[] = [];
    const sourcePositions = new Map<string, number>();
    const targetPositions = new Map<string, number>();

    function allocatePosition(preferred: number) {
      for (let distance = 0; distance <= edges.length * 2; distance += 1) {
        const offsets = distance === 0
          ? [0]
          : [distance * ROUTE_STUB_LANE_GAP, -distance * ROUTE_STUB_LANE_GAP];
        for (const offset of offsets) {
          const candidate = preferred + offset;
          if (
            candidate >= 12 &&
            usedPositions.every(
              (position) => Math.abs(position - candidate) >= ROUTE_STUB_LANE_GAP
            )
          ) {
            usedPositions.push(candidate);
            return candidate;
          }
        }
      }
      const fallback = Math.max(12, preferred + usedPositions.length * ROUTE_STUB_LANE_GAP);
      usedPositions.push(fallback);
      return fallback;
    }

    for (const edge of edges) {
      const source = nodesById.get(edge.sourceId);
      const target = nodesById.get(edge.targetId);
      if (!source || !target) {
        continue;
      }
      sourcePositions.set(edge.id, allocatePosition(source.bottom + 24));
      targetPositions.set(edge.id, allocatePosition(target.top - 24));
    }

    return { source: sourcePositions, target: targetPositions };
  }, [edges, nodesById]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState || !onMoveNode) {
        return;
      }

      const deltaX = (event.clientX - dragState.startClientX) / zoom;
      const deltaY = (event.clientY - dragState.startClientY) / zoom;

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

    function clearDragState() {
      const dragState = dragStateRef.current;
      if (dragState?.moved) {
        const draggedId = dragState.id;
        window.setTimeout(() => {
          if (suppressClickRef.current === draggedId) {
            suppressClickRef.current = null;
          }
        }, 0);
      }
      dragStateRef.current = null;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", clearDragState);
    window.addEventListener("pointercancel", clearDragState);
    window.addEventListener("blur", clearDragState);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", clearDragState);
      window.removeEventListener("pointercancel", clearDragState);
      window.removeEventListener("blur", clearDragState);
    };
  }, [onMoveNode, zoom]);

  return (
    <div
      className="relative min-h-[760px] min-w-full"
      style={{ minWidth: `${layout.width}px` }}
    >
      <div className="sticky right-4 top-4 z-20 ml-auto flex w-fit items-center gap-1 rounded-xl border border-border bg-white/95 p-1 shadow-sm backdrop-blur">
        <button
          aria-label="Zoom out"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6D6D78] transition hover:bg-[#F5F4FF] hover:text-accent disabled:opacity-40"
          disabled={zoom <= 0.6}
          onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(1))))}
          type="button"
        >
          <ZoomOut size={15} />
        </button>
        <span
          aria-live="polite"
          className="min-w-12 text-center text-xs font-semibold text-[#6D6D78]"
          data-testid="flow-zoom-level"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          aria-label="Zoom in"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6D6D78] transition hover:bg-[#F5F4FF] hover:text-accent disabled:opacity-40"
          disabled={zoom >= 1.5}
          onClick={() => setZoom((value) => Math.min(1.5, Number((value + 0.1).toFixed(1))))}
          type="button"
        >
          <ZoomIn size={15} />
        </button>
        <button
          aria-label="Reset zoom"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6D6D78] transition hover:bg-[#F5F4FF] hover:text-accent"
          onClick={() => setZoom(1)}
          type="button"
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div
        className="relative"
        style={{
          height: `${layout.height * zoom}px`,
          minWidth: `${layout.width * zoom}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            height: `${layout.height}px`,
            transform: `scale(${zoom})`,
            width: `${layout.width}px`,
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
          {edges.map((edge, edgeIndex) => {
            const source = nodesById.get(edge.sourceId);
            const target = nodesById.get(edge.targetId);

            if (!source || !target) {
              return null;
            }

            const sourceEdges = outgoingEdges.get(edge.sourceId) ?? [edge];
            const targetEdges = incomingEdges.get(edge.targetId) ?? [edge];
            const backEdgeIndex = backEdges.findIndex((item) => item.id === edge.id);
            const route = buildEdgeRoute(
              source,
              target,
              Math.max(sourceEdges.findIndex((item) => item.id === edge.id), 0),
              sourceEdges.length,
              Math.max(targetEdges.findIndex((item) => item.id === edge.id), 0),
              targetEdges.length,
              edgeIndex,
              layout.routeLaneBase,
              edgeStubPositions.source.get(edge.id) ?? source.bottom + 24,
              edgeStubPositions.target.get(edge.id) ?? target.top - 24,
              Math.max(backEdgeIndex, 0),
              backEdges.length,
              adjacentLanePositions.get(edge.id)
            );

            return (
              <g
                aria-label={`${edge.label}${edge.condition ? `. ${edge.condition}` : ""}`}
                data-edge-id={edge.id}
                key={edge.id}
                role="group"
              >
                <title>{edge.condition ? `${edge.label}: ${edge.condition}` : edge.label}</title>
                <path
                  d={route.path}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="9"
                />
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
                      width={transitionLabelWidth(edge.label)}
                      x={route.labelX - transitionLabelWidth(edge.label) / 2}
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
                if (event.detail === 0) {
                  onSelect(node.id);
                }
              }}
              aria-pressed={selectedId === node.id}
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
    </div>
  );
}
