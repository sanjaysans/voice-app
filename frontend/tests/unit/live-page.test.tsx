import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LivePage from "@/app/(app)/live/page";
import { buildDefaultRuntimeProfile } from "@/lib/voice-stack";

const mockUseMockApp = vi.fn();
const mockCreateBrowserRtcSession = vi.fn();
const mockUpdateLiveTestSession = vi.fn();

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

vi.mock("@/lib/live-session", () => ({
  createBrowserRtcSession: (...args: unknown[]) => mockCreateBrowserRtcSession(...args),
  updateLiveTestSession: (...args: unknown[]) => mockUpdateLiveTestSession(...args),
}));

vi.mock("livekit-client", () => ({
  Room: class {
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    localParticipant = {
      identity: "web-user-1",
      setMicrophoneEnabled: vi.fn(async () => undefined),
    };

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers[event] = [...(this.handlers[event] || []), handler];
      return this;
    }

    async connect() {
      this.handlers.connected?.forEach((handler) => handler());
      return undefined;
    }

    async disconnect() {
      return undefined;
    }
  },
  RoomEvent: {
    Connected: "connected",
    Disconnected: "disconnected",
    ParticipantConnected: "participantConnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TranscriptionReceived: "transcriptionReceived",
  },
  Track: {
    Kind: {
      Audio: "audio",
    },
  },
}));

function buildMockRuntime() {
  const runtimeProfile = buildDefaultRuntimeProfile();
  runtimeProfile.stt.providerAccountId = "stt-1";
  runtimeProfile.llm.providerAccountId = "llm-1";
  runtimeProfile.tts.providerAccountId = "tts-1";
  return runtimeProfile;
}

function buildMockContext() {
  return {
    tenantSlug: "voice-demo",
    workspaceId: "workspace-1",
    currentUser: { email: "admin@voice.local", displayName: "Voice Admin" },
    selectedAgentId: "agent-1",
    selectAgent: vi.fn(),
    agents: [
      {
        id: "agent-1",
        name: "Lead Router",
        description: "Primary qualification flow",
        sharedPrompt: "Qualify clearly.",
        stack: { stt: "Deepgram", llm: "OpenAI", tts: "Cartesia" },
        flowNodes: [{ id: "router", label: "Router", state: "Intent", prompt: "Route the caller safely." }],
        flowEdges: [],
        runtimeProfile: buildMockRuntime(),
      },
    ],
    selectedAgent: {
      id: "agent-1",
      name: "Lead Router",
      description: "Primary qualification flow",
      sharedPrompt: "Qualify clearly.",
      stack: { stt: "Deepgram", llm: "OpenAI", tts: "Cartesia" },
      flowNodes: [{ id: "router", label: "Router", state: "Intent", prompt: "Route the caller safely." }],
      flowEdges: [],
      runtimeProfile: buildMockRuntime(),
    },
    providerAccounts: [
      {
        id: "stt-1",
        providerKind: "stt",
        vendorName: "deepgram",
        label: "Primary STT",
        status: "active",
        hasConfig: true,
        configKeys: ["api_key"],
        preview: { default_model: "flux-general-en", language: "en-US" },
      },
      {
        id: "llm-1",
        providerKind: "llm",
        vendorName: "openai",
        label: "Primary LLM",
        status: "active",
        hasConfig: true,
        configKeys: ["api_key"],
        preview: { default_model: "gpt-4.1-mini" },
      },
      {
        id: "tts-1",
        providerKind: "tts",
        vendorName: "cartesia",
        label: "Primary TTS",
        status: "active",
        hasConfig: true,
        configKeys: ["api_key"],
        preview: {
          default_model: "sonic-3",
          default_voice_id: "voice-1",
          language: "en",
        },
      },
    ],
  };
}

describe("LivePage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockCreateBrowserRtcSession.mockReset();
    mockUpdateLiveTestSession.mockReset();
    mockUpdateLiveTestSession.mockResolvedValue({
      call_id: "call-test-1",
      agent_id: "agent-1",
      agent_name: "Lead Router",
      is_test: true,
      lifecycle_status: "in_progress",
      room_name: "voice-room-local",
      dispatch_id: "dispatch-123",
      participant_identity: "web-user-1",
      participant_name: "Voice Admin",
      vendor_trace: "Deepgram -> OpenAI -> Cartesia",
      summary: "Browser live test prepared.",
      outcome: "Queued for live test",
      next_step: "Join the room and speak with the agent.",
      synced_to_crm: false,
      transcript: [],
      extracted_variables: [],
      tool_calls: [],
      guardrails: [],
      metrics: {},
      event_log: [],
      started_at: null,
      ended_at: null,
      created_at: "2026-08-22T12:00:00Z",
    });
    mockUseMockApp.mockReturnValue(buildMockContext());
  });

  it("shows a missing-runtime error when a required connection is not bound", async () => {
    const user = userEvent.setup();
    const current = buildMockContext();
    mockUseMockApp.mockReturnValue({
      ...current,
      selectedAgent: {
        ...current.selectedAgent,
        runtimeProfile: {
          ...buildMockRuntime(),
          llm: { ...buildMockRuntime().llm, providerAccountId: "" },
        },
      },
      providerAccounts: current.providerAccounts.filter((account) => account.id !== "llm-1"),
    });
    render(<LivePage />);

    await user.click(screen.getAllByRole("button", { name: "Join live room" })[0] as HTMLElement);

    expect(
      screen.getByText("Finish the STT, LLM, and TTS connections in the agent runtime before launch.")
    ).toBeInTheDocument();
  });

  it("creates and persists a browser rtc test session from the selected agent runtime", async () => {
    const user = userEvent.setup();
    mockCreateBrowserRtcSession.mockResolvedValue({
      call_id: "call-test-1",
      room_name: "voice-room-local",
      participant_identity: "web-user-1",
      participant_name: "Voice Admin",
      server_url: "ws://127.0.0.1:7880",
      access_token: "jwt-token",
      dispatch_id: "dispatch-123",
      dispatch_agent_name: "lead-router",
      session: {},
      runtime: {},
      warnings: [],
      errors: [],
    });

    render(<LivePage />);
    await user.click(screen.getAllByRole("button", { name: "Join live room" })[0] as HTMLElement);

    expect(mockCreateBrowserRtcSession).toHaveBeenCalledWith(
      "voice-demo",
      "workspace-1",
      expect.objectContaining({
        agent_id: "agent-1",
        participant_name: "Voice Admin",
      })
    );

    await waitFor(() => {
      expect(mockUpdateLiveTestSession).toHaveBeenCalledWith(
        "voice-demo",
        "workspace-1",
        "call-test-1",
        expect.objectContaining({
          lifecycle_status: "in_progress",
        })
      );
    });

    expect(screen.getByText("Persisted as a test call")).toBeInTheDocument();
  });
});
