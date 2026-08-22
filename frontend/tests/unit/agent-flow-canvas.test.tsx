import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentFlowCanvas, autoArrangeFlowNodes } from "@/components/agent-flow-canvas";

describe("AgentFlowCanvas", () => {
  it("auto sizes the canvas and renders routed transitions for vertical flows", () => {
    render(
      <AgentFlowCanvas
        edges={[
          {
            id: "edge-1",
            sourceId: "router",
            targetId: "booking",
            label: "Qualified",
            condition: "Lead confirms intent",
          },
        ]}
        nodes={[
          {
            id: "router",
            label: "Entry router",
            x: 120,
            y: 120,
            tone: "neutral",
            state: "Open the conversation",
          },
          {
            id: "booking",
            label: "Booking",
            x: 120,
            y: 360,
            tone: "success",
            state: "Schedule the next step",
          },
        ]}
        onSelect={vi.fn()}
        selectedId="router"
      />
    );

    expect(screen.getByRole("button", { name: /entry router/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /booking/i })).toBeInTheDocument();
    expect(screen.getByText("Qualified")).toBeInTheDocument();

    const canvas = document.querySelector("svg") as SVGSVGElement | null;
    const path = document.querySelector("svg g path") as SVGPathElement | null;
    const container = canvas?.parentElement as HTMLDivElement | null;

    expect(canvas).not.toBeNull();
    expect(path).not.toBeNull();
    expect(canvas?.getAttribute("width")).toBe("900");
    expect(Number.parseInt(container?.style.minHeight ?? "0", 10)).toBeGreaterThanOrEqual(560);
    expect(path?.getAttribute("marker-end")).toBe("url(#state-transition-arrow)");
  });

  it("renders branching transitions from one state to multiple next states", () => {
    render(
      <AgentFlowCanvas
        edges={[
          {
            id: "edge-1",
            sourceId: "entry",
            targetId: "qualified",
            label: "High intent",
            condition: "Ready to proceed",
          },
          {
            id: "edge-2",
            sourceId: "entry",
            targetId: "nurture",
            label: "Needs follow-up",
            condition: "Call back later",
          },
        ]}
        nodes={[
          {
            id: "entry",
            label: "Entry",
            x: 0,
            y: 0,
            tone: "neutral",
            state: "Check caller intent",
          },
          {
            id: "qualified",
            label: "Qualified",
            x: 300,
            y: 0,
            tone: "success",
            state: "Move to booking",
          },
          {
            id: "nurture",
            label: "Nurture",
            x: 300,
            y: 200,
            tone: "warning",
            state: "Queue for follow-up",
          },
        ]}
        onSelect={vi.fn()}
        selectedId="entry"
      />
    );

    expect(screen.getByText("High intent")).toBeInTheDocument();
    expect(screen.getByText("Needs follow-up")).toBeInTheDocument();

    const paths = [...document.querySelectorAll("svg g path[marker-end]")];
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const uniquePaths = new Set(paths.map((path) => path.getAttribute("d")));
    expect(uniquePaths.size).toBeGreaterThanOrEqual(2);
  });

  it("auto organizes branches into a vertical workflow with horizontal branch splits", () => {
    const arranged = autoArrangeFlowNodes(
      [
        {
          id: "entry",
          label: "Entry",
          x: 0,
          y: 0,
          tone: "neutral",
          state: "Check caller intent",
        },
        {
          id: "qualified",
          label: "Qualified",
          x: 0,
          y: 0,
          tone: "success",
          state: "Move to booking",
        },
        {
          id: "nurture",
          label: "Nurture",
          x: 0,
          y: 0,
          tone: "warning",
          state: "Queue for follow-up",
        },
      ],
      [
        {
          id: "edge-1",
          sourceId: "entry",
          targetId: "qualified",
          label: "High intent",
          condition: "Ready to proceed",
        },
        {
          id: "edge-2",
          sourceId: "entry",
          targetId: "nurture",
          label: "Needs follow-up",
          condition: "Call back later",
        },
      ]
    );

    const entry = arranged.find((node) => node.id === "entry");
    const qualified = arranged.find((node) => node.id === "qualified");
    const nurture = arranged.find((node) => node.id === "nurture");

    expect(entry?.y).toBe(0);
    expect(qualified?.y).toBeGreaterThan(entry?.y ?? 0);
    expect(nurture?.y).toBeGreaterThan(entry?.y ?? 0);
    expect(qualified?.x).not.toBe(nurture?.x);
  });
});
