import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentFlowCanvas, autoArrangeFlowNodes } from "@/components/agent-flow-canvas";

afterEach(cleanup);

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

    const canvas = document.querySelector('svg[width="900"]') as SVGSVGElement | null;
    const path = canvas?.querySelector("g path[marker-end]") as SVGPathElement | null;
    const container = canvas?.parentElement as HTMLDivElement | null;

    expect(canvas).not.toBeNull();
    expect(path).not.toBeNull();
    expect(canvas?.getAttribute("width")).toBe("900");
    expect(Number.parseInt(container?.style.height ?? "0", 10)).toBeGreaterThanOrEqual(560);
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

  it("supports zoom controls without changing the graph coordinate model", async () => {
    const user = userEvent.setup();
    render(
      <AgentFlowCanvas
        edges={[]}
        nodes={[
          {
            id: "entry",
            label: "Entry",
            x: 0,
            y: 0,
            tone: "neutral",
            state: "Start the call",
          },
        ]}
        onSelect={vi.fn()}
        selectedId="entry"
      />
    );

    expect(screen.getByTestId("flow-zoom-level")).toHaveTextContent("100%");
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("flow-zoom-level")).toHaveTextContent("110%");
    await user.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByTestId("flow-zoom-level")).toHaveTextContent("100%");
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

  it("moves convergence states to a side rail instead of crossing the primary path", () => {
    const arranged = autoArrangeFlowNodes(
      [
        { id: "entry", label: "Entry", x: 0, y: 0, tone: "neutral", state: "Start" },
        { id: "main", label: "Main path", x: 0, y: 0, tone: "success", state: "Continue" },
        { id: "branch", label: "Branch", x: 0, y: 0, tone: "warning", state: "Alternate" },
        { id: "close", label: "Close", x: 0, y: 0, tone: "warning", state: "Finish" },
      ],
      [
        { id: "entry-main", sourceId: "entry", targetId: "main", label: "Main", condition: "" },
        { id: "entry-branch", sourceId: "entry", targetId: "branch", label: "Branch", condition: "" },
        { id: "main-close", sourceId: "main", targetId: "close", label: "Main complete", condition: "" },
        { id: "branch-close", sourceId: "branch", targetId: "close", label: "Branch complete", condition: "" },
      ]
    );

    const main = arranged.find((node) => node.id === "main");
    const branch = arranged.find((node) => node.id === "branch");
    const close = arranged.find((node) => node.id === "close");

    expect(main?.y).toBe(branch?.y);
    expect(close?.y).toBeGreaterThan(main?.y ?? 0);
    expect(close?.x).toBeGreaterThan(main?.x ?? 0);
  });

  it("keeps backward transitions on distinct left-side lanes", () => {
    render(
      <AgentFlowCanvas
        edges={[
          { id: "back-1", sourceId: "one", targetId: "entry", label: "Needs retry", condition: "Retry" },
          { id: "back-2", sourceId: "two", targetId: "entry", label: "Needs correction", condition: "Correct" },
        ]}
        nodes={[
          { id: "entry", label: "Entry", x: 0, y: 0, tone: "neutral", state: "Start" },
          { id: "one", label: "One", x: 0, y: 300, tone: "success", state: "Continue" },
          { id: "two", label: "Two", x: 300, y: 300, tone: "warning", state: "Alternate" },
        ]}
        onSelect={vi.fn()}
        selectedId="entry"
      />
    );

    const paths = [...document.querySelectorAll("svg g path[marker-end]")];
    expect(paths).toHaveLength(2);
    expect(new Set(paths.map((path) => path.getAttribute("d"))).size).toBe(2);
    expect(screen.getByRole("group", { name: "Needs retry. Retry" })).toBeInTheDocument();
  });

  it("keeps many adjacent transitions on distinct horizontal lanes", () => {
    const sources = Array.from({ length: 6 }, (_, index) => ({
      id: `source-${index}`,
      label: `Source ${index}`,
      x: index * 250,
      y: 0,
      tone: "neutral" as const,
      state: "Continue",
    }));

    render(
      <AgentFlowCanvas
        edges={sources.map((source, index) => ({
          id: `edge-${index}`,
          sourceId: source.id,
          targetId: "target",
          label: `Path ${index}`,
          condition: "Continue",
        }))}
        nodes={[
          ...sources,
          {
            id: "target",
            label: "Target",
            x: 625,
            y: 200,
            tone: "success",
            state: "Receive",
          },
        ]}
        onSelect={vi.fn()}
        selectedId="target"
      />
    );

    const laneYs = [...document.querySelectorAll("svg g path[marker-end]")].map((path) => {
      const matches = [...(path.getAttribute("d") ?? "").matchAll(/Q [\d.]+ ([\d.]+)/g)];
      return matches[0]?.[1];
    });

    expect(laneYs).toHaveLength(6);
    expect(new Set(laneYs).size).toBe(6);
  });

  it("does not double-select a node after a mouse press", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <AgentFlowCanvas
        edges={[]}
        nodes={[{
          id: "entry",
          label: "Entry",
          x: 0,
          y: 0,
          tone: "neutral",
          state: "Start",
        }]}
        onSelect={onSelect}
        selectedId="entry"
      />
    );

    const node = screen.getByRole("button", { name: /entry/i });
    await user.click(node);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
