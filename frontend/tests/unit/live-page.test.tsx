import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LivePage from "@/app/(app)/live/page";
import { buildDefaultRuntimeProfile } from "@/lib/voice-stack";

const mockUseMockApp = vi.fn();
const mockCreateBrowserRtcSession = vi.fn();

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

vi.mock("@/lib/live-session", () => ({
  createBrowserRtcSession: (...args: unknown[]) => mockCreateBrowserRtcSession(...args),
}));

vi.mock("livekit-client", () => ({
  Room: class {
    localParticipant = {
      setMicrophoneEnabled: vi.fn(async () => undefined),
    };

    on() {
      return this;
    }

    async connect() {
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
    currentUser: { email: "admin@voice.local" },
    selectedAgentId: "agent-1",
    selectAgent: vi.fn(),
    agents: [
      {
        id: "agent-1",
        name: "Lead Router",
        description: "Primary qualification flow",
        flowNodes: [{ id: "router", prompt: "Route the caller safely." }],
        runtimeProfile: buildMockRuntime(),
      },
    ],
    selectedAgent: {
      id: "agent-1",
      name: "Lead Router",
      description: "Primary qualification flow",
      flowNodes: [{ id: "router", prompt: "Route the caller safely." }],
      runtimeProfile: buildMockRuntime(),
    },
    providerAccounts: [
      {
        id: "stt-1",
        providerKind: "stt",
        vendorName: "deepgram",
        label: "Primary STT",
        status: "active",
        preview: { api_key: "dg-key", default_model: "flux-general-en", language: "en-US" },
      },
      {
        id: "llm-1",
        providerKind: "llm",
        vendorName: "openai",
        label: "Primary LLM",
        status: "active",
        preview: { api_key: "oa-key", default_model: "gpt-4.1-mini" },
      },
      {
        id: "tts-1",
        providerKind: "tts",
        vendorName: "cartesia",
        label: "Primary TTS",
        status: "active",
        preview: {
          api_key: "ca-key",
          default_model: "sonic-3",
          default_voice_id: "voice-1",
          language: "en",
        },
      },
    ],
  };
}

describe("LivePage", () => {
  beforeEach(() => {
    mockCreateBrowserRtcSession.mockReset();
    mockUseMockApp.mockReturnValue(buildMockContext());
  });

  it("shows a missing-runtime error when a required connection is not bound", async () => {
    const user = userEvent.setup();
    const current = buildMockContext();
    mockUseMockApp.mockReturnValueOnce({
      ...current,
      selectedAgent: {
        ...current.selectedAgent,
        runtimeProfile: {
          ...buildMockRuntime(),
          llm: { ...buildMockRuntime().llm, providerAccountId: "" }
        },
      },
    });
    render(<LivePage />);

    await user.click(screen.getAllByRole("button", { name: "Join live room" })[0] as HTMLElement);

    expect(
      screen.getByText("Finish the STT, LLM, and TTS connections in the agent runtime before launch.")
    ).toBeInTheDocument();
  });

  it("creates a browser rtc session from the selected agent runtime", async () => {
    const user = userEvent.setup();
    mockCreateBrowserRtcSession.mockResolvedValue({
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
        dispatch_agent_name: "lead-router",
        stt: expect.objectContaining({ api_key: "dg-key" }),
        llm: expect.objectContaining({ api_key: "oa-key" }),
        tts: expect.objectContaining({ api_key: "ca-key" }),
      })
    );
  });
});
