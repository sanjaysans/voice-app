"use client";

import { cn } from "@/lib/utils";

type BuilderNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  tone: "neutral" | "success" | "warning";
  state: string;
};

type CanvasProps = {
  nodes: BuilderNode[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const edges = [
  ["router", "billing"],
  ["router", "support"],
  ["router", "sales"],
  ["support", "escalation"]
] as const;

export function AgentFlowCanvas({ nodes, selectedId, onSelect }: CanvasProps) {
  return (
    <div className="relative h-full w-full overflow-auto scrollbar-subtle p-8">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {edges.map(([sourceId, targetId]) => {
          const source = nodes.find((node) => node.id === sourceId);
          const target = nodes.find((node) => node.id === targetId);

          if (!source || !target) {
            return null;
          }

          return (
            <path
              key={`${sourceId}-${targetId}`}
              d={`M ${source.x + 190} ${source.y + 54} C ${source.x + 320} ${source.y + 54}, ${target.x - 70} ${target.y + 54}, ${target.x} ${target.y + 54}`}
              fill="none"
              stroke="rgba(102, 89, 255, 0.35)"
              strokeWidth="3"
            />
          );
        })}
      </svg>

      {nodes.map((node) => (
        <button
          key={node.id}
          className={cn(
            "absolute w-[190px] rounded-2xl border bg-white p-4 text-left shadow-sm transition",
            selectedId === node.id
              ? "border-[rgba(102,89,255,0.35)] bg-[rgba(102,89,255,0.08)] shadow-surface"
              : "border-border hover:border-[rgba(102,89,255,0.2)]"
          )}
          onClick={() => onSelect(node.id)}
          style={{ left: node.x, top: node.y }}
          type="button"
        >
          <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">{node.id === "router" ? "Router" : "Specialist"}</p>
          <h3 className="mt-2 text-base font-semibold">{node.label}</h3>
          <p className="mt-3 text-sm text-[#6D6D78]">{node.state}</p>
        </button>
      ))}
    </div>
  );
}
