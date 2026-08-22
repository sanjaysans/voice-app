import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CallsPage from "@/app/(app)/calls/page";

const mockUseMockApp = vi.fn();

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    agents: [{ id: "agent_1", name: "Demo Agent" }],
    selectedAgentId: "agent_1",
    scenarios: [
      {
        id: "scenario_1",
        name: "Inbound qualification",
        summary: "Test scenario",
        outcome: "Meeting booked",
        tone: "success",
        leadName: "Maya Patel",
        company: "Northstar Clinics",
        phone: "+1 415 555 0188",
        timeline: ["Dialing", "Connected"],
        transcriptSeed: [{ speaker: "Lead", text: "Hello" }],
        extractedVariables: [],
        toolCalls: [],
        guardrails: [],
        nextStep: "Book meeting",
      },
    ],
    activeCall: null,
    callHistory: [
      {
        id: "call_1",
        leadName: "Maya Patel",
        company: "Northstar Clinics",
        agentName: "Demo Agent",
        time: "Today",
        outcome: "Meeting booked",
        statusTone: "success",
        transcript: [],
        extractedVariables: [],
        toolCalls: [],
        guardrails: [],
        duration: "02:10",
        vendorTrace: "Deepgram -> GPT-4.1 -> ElevenLabs",
        nextStep: "Book meeting",
        status: "Completed",
        syncedToCrm: false,
        phone: "+1 415 555 0188",
        scenarioName: "Inbound qualification",
        summary: "summary",
        agentId: "agent_1",
      },
    ],
    selectedCall: {
      id: "call_1",
      leadName: "Maya Patel",
      company: "Northstar Clinics",
      agentName: "Demo Agent",
      time: "Today",
      outcome: "Meeting booked",
      statusTone: "success",
      transcript: [],
      extractedVariables: [],
      toolCalls: [],
      guardrails: [],
      duration: "02:10",
      vendorTrace: "Deepgram -> GPT-4.1 -> ElevenLabs",
      nextStep: "Book meeting",
      status: "Completed",
      syncedToCrm: false,
      phone: "+1 415 555 0188",
      scenarioName: "Inbound qualification",
      summary: "summary",
      agentId: "agent_1",
    },
    callsView: "launch",
    setCallsView: vi.fn(),
    startCall: vi.fn(),
    selectCall: vi.fn(),
    markSynced: vi.fn(),
    deleteCall: vi.fn(),
    ...overrides,
  };
}

describe("CallsPage", () => {
  beforeEach(() => {
    mockUseMockApp.mockReturnValue(createMockContext());
  });

  it("blocks launch when the phone number is too short", async () => {
    const user = userEvent.setup();
    render(<CallsPage />);

    const phoneInput = screen.getByLabelText("Phone number");
    await user.clear(phoneInput);
    await user.type(phoneInput, "12345");
    await user.click(screen.getByRole("button", { name: "Trigger & connect" }));

    expect(screen.getByText("Enter a valid phone number to launch the call.")).toBeInTheDocument();
  });

  it("starts a call when the form is valid", async () => {
    const user = userEvent.setup();
    const startCall = vi.fn();
    mockUseMockApp.mockReturnValue(createMockContext({ startCall }));

    render(<CallsPage />);
    const launchPanels = screen.getAllByRole("heading", { name: "Trigger & connect" });
    const launchPanel = launchPanels[launchPanels.length - 1]?.closest("section");
    expect(launchPanel).not.toBeNull();
    await user.click(
      within(launchPanel as HTMLElement).getByRole("button", { name: "Trigger & connect" })
    );

    expect(startCall).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent_1",
        scenarioId: "scenario_1",
      })
    );
  });
});
