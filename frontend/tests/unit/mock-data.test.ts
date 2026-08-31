import { describe, expect, it } from "vitest";
import { createAgent, createFlowNodes } from "@/lib/mock-data";

describe("agent model helpers", () => {
  it("creates a blank agent without fabricated call data", () => {
    const agent = createAgent("Support workflow", "empty");

    expect(agent.name).toBe("Support workflow");
    expect(agent.status).toBe("Draft");
    expect(agent.flowNodes).toHaveLength(0);
    expect(agent.flowEdges).toHaveLength(0);
  });

  it("creates a reusable starter flow only when requested", () => {
    expect(createFlowNodes("Support workflow")).toHaveLength(6);
  });
});
