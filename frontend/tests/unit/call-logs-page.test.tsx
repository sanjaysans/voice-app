import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CallLogsPage from "@/app/(app)/calls/logs/page";

const mockUseMockApp = vi.fn();

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    callHistory: [
      {
        id: "call_1",
        leadName: "Maya Patel",
        company: "Northstar Clinics",
        agentName: "Demo Agent",
        time: "Today",
        outcome: "Meeting booked",
        statusTone: "success",
        transcript: [{ speaker: "Lead", timestamp: "00:01", text: "Hello" }],
        extractedVariables: [{ key: "Lead score", value: "91 / 100" }],
        toolCalls: [{ name: "crm_lookup", result: "Matched owner" }],
        guardrails: ["Consent notice delivered"],
        duration: "02:10",
        vendorTrace: "Deepgram -> GPT-4.1 -> Cartesia",
        nextStep: "Book meeting",
        status: "Completed",
        syncedToCrm: false,
        phone: "+1 415 555 0188",
        scenarioName: "Inbound qualification",
        summary: "summary",
        agentId: "agent_1",
      },
      {
        id: "call_2",
        leadName: "Jordan Lee",
        company: "Peak Home Services",
        agentName: "Demo Agent",
        time: "Yesterday",
        outcome: "Follow-up",
        statusTone: "warning",
        transcript: [{ speaker: "Lead", timestamp: "00:02", text: "Need a follow-up" }],
        extractedVariables: [{ key: "Next touch", value: "Human follow-up" }],
        toolCalls: [{ name: "task_create", result: "Queued follow-up" }],
        guardrails: ["Consent notice delivered"],
        duration: "03:14",
        vendorTrace: "Deepgram -> GPT-4.1 -> Cartesia",
        nextStep: "Follow up next week",
        status: "Follow-up",
        syncedToCrm: false,
        phone: "+1 212 555 0164",
        scenarioName: "Outbound reactivation",
        summary: "follow-up summary",
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
      transcript: [{ speaker: "Lead", timestamp: "00:01", text: "Hello" }],
      extractedVariables: [{ key: "Lead score", value: "91 / 100" }],
      toolCalls: [{ name: "crm_lookup", result: "Matched owner" }],
      guardrails: ["Consent notice delivered"],
      duration: "02:10",
      vendorTrace: "Deepgram -> GPT-4.1 -> Cartesia",
      nextStep: "Book meeting",
      status: "Completed",
      syncedToCrm: false,
      phone: "+1 415 555 0188",
      scenarioName: "Inbound qualification",
      summary: "summary",
      agentId: "agent_1",
    },
    selectCall: vi.fn(),
    markSynced: vi.fn(),
    deleteCall: vi.fn(),
    ...overrides,
  };
}

describe("CallLogsPage", () => {
  beforeEach(() => {
    mockUseMockApp.mockReturnValue(createMockContext());
  });

  it("renders the review surface for the selected call", () => {
    render(<CallLogsPage />);

    expect(screen.getByText("Call review")).toBeInTheDocument();
    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(screen.getByText("Consent notice delivered")).toBeInTheDocument();
  });

  it("shows an empty state when no call history exists", () => {
    mockUseMockApp.mockReturnValue(
      createMockContext({
        callHistory: [],
        selectedCall: null,
      })
    );

    render(<CallLogsPage />);
    expect(screen.getByText("No call logs yet")).toBeInTheDocument();
  });
});
