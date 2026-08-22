import { describe, expect, it } from "vitest";
import {
  createActiveCall,
  createCallRecord,
  demoScenarios,
  initialAgents,
} from "@/lib/mock-data";

describe("mock-data helpers", () => {
  it("creates an active call with the first transcript turn and current phase", () => {
    const activeCall = createActiveCall({
      agent: initialAgents[0],
      scenario: demoScenarios[0],
      leadName: "Morgan Hart",
      company: "Signal Labs",
      phone: "+15551230000",
    });

    expect(activeCall.agentName).toBe(initialAgents[0].name);
    expect(activeCall.scenarioId).toBe(demoScenarios[0].id);
    expect(activeCall.phaseIndex).toBe(0);
    expect(activeCall.timeline).toHaveLength(1);
    expect(activeCall.transcript).toHaveLength(1);
    expect(activeCall.transcript[0]?.speaker).toBe("Lead");
  });

  it("derives a completed call record from a successful scenario", () => {
    const activeCall = createActiveCall({
      agent: initialAgents[0],
      scenario: demoScenarios[0],
      leadName: demoScenarios[0].leadName,
      company: demoScenarios[0].company,
      phone: demoScenarios[0].phone,
    });
    const record = createCallRecord(activeCall, initialAgents[0], demoScenarios[0]);

    expect(record.status).toBe("Completed");
    expect(record.statusTone).toBe("success");
    expect(record.vendorTrace).toContain(initialAgents[0].stack.llm);
  });
});
