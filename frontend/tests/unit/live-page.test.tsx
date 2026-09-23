import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LivePage from "@/app/(app)/live/page";
import { buildDefaultRuntimeProfile } from "@/lib/voice-stack";

const mockUseMockApp = vi.fn();
const mockCreateBrowserRtcSession = vi.fn();
const mockUpdateLiveTestSession = vi.fn();
const mockCreateTextChatSession = vi.fn();
const mockSendTextChatMessage = vi.fn();
const mockEndTextChatSession = vi.fn();
let latestRoom: {
  handlers: Record<string, Array<(...args: unknown[]) => void>>;
  remoteParticipants: Map<string, unknown>;
} | null = null;

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

vi.mock("@/lib/live-session", () => ({
  createBrowserRtcSession: (...args: unknown[]) => mockCreateBrowserRtcSession(...args),
  updateLiveTestSession: (...args: unknown[]) => mockUpdateLiveTestSession(...args),
  createTextChatSession: (...args: unknown[]) => mockCreateTextChatSession(...args),
  sendTextChatMessage: (...args: unknown[]) => mockSendTextChatMessage(...args),
  endTextChatSession: (...args: unknown[]) => mockEndTextChatSession(...args),
}));

vi.mock("livekit-client", () => ({
  Room: class {
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    remoteParticipants = new Map();

    localParticipant = {
      identity: "web-user-1",
      setMicrophoneEnabled: vi.fn(async () => undefined),
    };

    constructor() {
      latestRoom = this;
    }

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

    async startAudio() {
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
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
    AudioPlaybackStatusChanged: "audioPlaybackChanged",
    MediaDevicesError: "mediaDevicesError",
    DataReceived: "dataReceived",
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
    mockCreateTextChatSession.mockReset();
    mockSendTextChatMessage.mockReset();
    mockEndTextChatSession.mockReset();
    latestRoom = null;
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

  it("opens the text chat test without requiring audio connections", async () => {
    const user = userEvent.setup();
    mockCreateTextChatSession.mockResolvedValue({
      call_id: "chat-call-1",
      agent_id: "agent-1",
      agent_name: "Lead Router",
      execution_mode: "text_chat",
      lifecycle_status: "in_progress",
      active_state_id: null,
      active_state_label: null,
      model: "gpt-4.1-mini",
      transcript: [],
      event_log: [],
      metrics: { turn_count: 0 },
      started_at: "2026-09-07T10:00:00Z",
      ended_at: null,
      created_at: "2026-09-07T10:00:00Z",
    });

    render(<LivePage />);
    await user.click(screen.getByRole("tab", { name: "Chat test" }));
    expect(screen.getByRole("heading", { name: "Chat test" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start chat test" }));

    await waitFor(() => expect(mockCreateTextChatSession).toHaveBeenCalledWith(
      "voice-demo",
      "workspace-1",
      { agent_id: "agent-1", variables: {} },
    ));
    expect(await screen.findByText("Lead Router")).toBeInTheDocument();
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

  it("finalizes a session when LiveKit disconnects unexpectedly", async () => {
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
    await waitFor(() => expect(latestRoom).not.toBeNull());

    latestRoom?.handlers.disconnected?.forEach((handler) => handler());

    await waitFor(() => {
      expect(mockUpdateLiveTestSession).toHaveBeenCalledWith(
        "voice-demo",
        "workspace-1",
        "call-test-1",
        expect.objectContaining({ lifecycle_status: "cancelled" })
      );
    });
  });

  it("stops the microphone and exits the live view immediately when ending a call", async () => {
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
    await waitFor(() => expect(latestRoom).not.toBeNull());

    await user.click(screen.getByRole("button", { name: "End call" }));

    expect(await screen.findByText("Start a browser live test")).toBeInTheDocument();
    await waitFor(() => {
      expect(mockUpdateLiveTestSession).toHaveBeenCalledWith(
        "voice-demo",
        "workspace-1",
        "call-test-1",
        expect.objectContaining({ lifecycle_status: "completed" })
      );
    });
  });

  it("renders worker runtime metrics received over the LiveKit data channel", async () => {
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
    await waitFor(() => expect(latestRoom).not.toBeNull());

    latestRoom?.handlers.dataReceived?.forEach((handler) =>
      handler(
        new TextEncoder().encode(
          JSON.stringify({
            event_type: "turn.metrics",
            metric_type: "llm_metrics",
            label: "openai.responses",
            ttft: 0.22,
            prompt_tokens: 120,
          })
        ),
        { identity: "agent-1" },
        undefined,
        "voice_runtime"
      )
    );

    expect(await screen.findByText("Pipeline metrics")).toBeInTheDocument();
    expect(screen.getByText("0.22s")).toBeInTheDocument();
    expect(screen.getByText("Worker")).toBeInTheDocument();
    expect(screen.getByText("openai.responses timing recorded")).toBeInTheDocument();
  });
});
