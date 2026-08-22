import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentStudioScreen } from "@/components/agent-studio-screen";
import { buildDefaultRuntimeProfile } from "@/lib/voice-stack";

const mockUseMockApp = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => "/agents/agent-1",
}));

vi.mock("@/lib/mock-app", () => ({
  useMockApp: () => mockUseMockApp(),
}));

vi.mock("@/components/agent-flow-canvas", () => ({
  AgentFlowCanvas: () => <div data-testid="agent-flow-canvas">State canvas</div>,
  autoArrangeFlowNodes: (nodes: Array<Record<string, unknown>>) =>
    nodes.map((node, index) => ({
      ...node,
      x: index === 0 ? 0 : (index - 1) * 320,
      y: index === 0 ? 0 : 186,
    })),
}));

function buildAgent() {
  const runtimeProfile = buildDefaultRuntimeProfile();
  runtimeProfile.telephony.providerAccountId = "tel-1";
  runtimeProfile.telephony.phoneNumber = "+1 415 555 0101";
  runtimeProfile.stt.providerAccountId = "stt-1";
  runtimeProfile.llm.providerAccountId = "llm-1";
  runtimeProfile.tts.providerAccountId = "tts-1";

  return {
    id: "agent-1",
    name: "Lead Router",
    description: "Primary qualification workflow",
    sharedPrompt: "Qualify the lead and route safely.",
    status: "Draft" as const,
    statusTone: "warning" as const,
    lastEdited: "1 hour ago",
    segment: "Qualification",
    goal: "Book the right next step",
    stack: {
      stt: "Deepgram",
      llm: "OpenAI",
      tts: "Cartesia",
    },
    runtimeProfile,
    flowNodes: [
      {
        id: "router",
        label: "Entry state",
        x: 120,
        y: 120,
        tone: "neutral" as const,
        state: "Open the conversation",
        prompt: "Confirm intent and decide the right next state.",
        tools: [],
        knowledge: [],
        vendors: {
          stt: "Deepgram",
          llm: "OpenAI",
          tts: "Cartesia",
        },
      },
    ],
    flowEdges: [],
    toolsCatalog: [],
    knowledgeSources: [],
  };
}

function buildContext(overrides: Record<string, unknown> = {}) {
  const agent = buildAgent();

  return {
    agents: [agent],
    selectedAgent: agent,
    selectedAgentId: agent.id,
    selectAgent: vi.fn(),
    updateAgent: vi.fn(async () => undefined),
    publishAgent: vi.fn(async () => undefined),
    providerAccounts: [
      {
        id: "tel-1",
        providerKind: "telephony",
        vendorName: "twilio",
        label: "Primary telephony",
        status: "active",
        preview: { phone_numbers: "+1 415 555 0101" },
      },
      {
        id: "stt-1",
        providerKind: "stt",
        vendorName: "deepgram",
        label: "Primary STT",
        status: "active",
        preview: { api_key: "dg-key" },
      },
      {
        id: "llm-1",
        providerKind: "llm",
        vendorName: "openai",
        label: "Primary LLM",
        status: "active",
        preview: { api_key: "oa-key" },
      },
      {
        id: "tts-1",
        providerKind: "tts",
        vendorName: "cartesia",
        label: "Primary TTS",
        status: "active",
        preview: { api_key: "ca-key" },
      },
    ],
    ...overrides,
  };
}

describe("AgentStudioScreen", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockUseMockApp.mockReturnValue(buildContext());
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the new step tabs and removes tools and knowledge from the editor", () => {
    render(<AgentStudioScreen agentId="agent-1" />);

    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telephony" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "States" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Selected workflow")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared tools catalog")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared knowledge catalog")).not.toBeInTheDocument();
  });

  it("shows workflow language selection and direct model entry controls", async () => {
    const user = userEvent.setup();
    render(<AgentStudioScreen agentId="agent-1" />);

    await user.click(screen.getAllByRole("button", { name: "Workflow" })[0] as HTMLElement);
    expect(screen.getByText("Default call language")).toBeInTheDocument();
    expect(screen.getByText("Workflow sample rate")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "STT" })[0] as HTMLElement);
    expect(screen.getByText("Model name or ID")).toBeInTheDocument();
    expect(screen.getByText("Resolved language code")).toBeInTheDocument();
  });

  it("keeps edits local until save is clicked", async () => {
    const user = userEvent.setup();
    const updateAgent = vi.fn(async () => undefined);
    mockUseMockApp.mockReturnValue(buildContext({ updateAgent }));

    render(<AgentStudioScreen agentId="agent-1" />);

    const nameInput = screen.getAllByDisplayValue("Lead Router")[0] as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "New local workflow");

    expect(updateAgent).not.toHaveBeenCalled();

    const saveButtons = screen.getAllByRole("button", { name: "Save changes" });
    await user.click(saveButtons[saveButtons.length - 1] as HTMLElement);

    await waitFor(() => {
      expect(updateAgent).toHaveBeenCalledTimes(1);
    });
  });

  it("warns before leaving with unsaved changes", async () => {
    const user = userEvent.setup();

    render(<AgentStudioScreen agentId="agent-1" />);
    const nameInput = screen.getAllByDisplayValue("Lead Router")[0] as HTMLInputElement;
    await user.type(nameInput, " updated");
    const backButtons = screen.getAllByRole("button", { name: "Back to agents" });
    await user.click(backButtons[backButtons.length - 1] as HTMLElement);

    const modalTitle = screen
      .getAllByText("Unsaved changes")
      .find((element) => element.tagName === "H2") as HTMLElement;
    expect(modalTitle).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    const modal = modalTitle.parentElement
      ?.parentElement?.parentElement as HTMLElement;
    await user.click(within(modal).getByRole("button", { name: "Discard changes" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/agents");
    });
  });

  it("auto organizes state positions locally before save", async () => {
    const user = userEvent.setup();
    const updateAgent = vi.fn(async () => undefined);
    const branchAgent = {
      ...buildAgent(),
      flowNodes: [
        {
          id: "router",
          label: "Entry state",
          x: 0,
          y: 0,
          tone: "neutral" as const,
          state: "Start the conversation",
          prompt: "Open and route.",
          tools: [],
          knowledge: [],
          vendors: {
            stt: "Deepgram",
            llm: "OpenAI",
            tts: "Cartesia",
          },
        },
        {
          id: "state_2",
          label: "State 2",
          x: 0,
          y: 0,
          tone: "success" as const,
          state: "Qualified route",
          prompt: "Handle qualified path.",
          tools: [],
          knowledge: [],
          vendors: {
            stt: "Deepgram",
            llm: "OpenAI",
            tts: "Cartesia",
          },
        },
        {
          id: "state_3",
          label: "State 3",
          x: 0,
          y: 0,
          tone: "warning" as const,
          state: "Follow-up route",
          prompt: "Handle follow-up path.",
          tools: [],
          knowledge: [],
          vendors: {
            stt: "Deepgram",
            llm: "OpenAI",
            tts: "Cartesia",
          },
        },
      ],
      flowEdges: [
        {
          id: "edge_1",
          sourceId: "router",
          targetId: "state_2",
          label: "Qualified",
          condition: "High intent",
        },
        {
          id: "edge_2",
          sourceId: "router",
          targetId: "state_3",
          label: "Follow-up",
          condition: "Needs later call",
        },
      ],
    };
    mockUseMockApp.mockReturnValue(
      buildContext({
        updateAgent,
        agents: [branchAgent],
        selectedAgent: branchAgent,
      })
    );

    render(<AgentStudioScreen agentId="agent-1" />);

    await user.click(screen.getByRole("button", { name: "States" }));
    await user.click(screen.getByRole("button", { name: "Auto organize" }));
    const saveButtons = screen.getAllByRole("button", { name: "Save changes" });
    const saveButton = saveButtons[saveButtons.length - 1] as HTMLElement | undefined;
    expect(saveButton).toBeDefined();
    await user.click(saveButton as HTMLElement);

    await waitFor(() => {
      expect(updateAgent).toHaveBeenCalledTimes(1);
    });

    const updateAgentCall = updateAgent.mock.calls[0] as unknown as
      | [string, (agent: typeof branchAgent) => typeof branchAgent]
      | undefined;
    expect(updateAgentCall).toBeDefined();
    const applyUpdate = updateAgentCall?.[1];
    expect(applyUpdate).toBeTypeOf("function");
    const savedAgent = applyUpdate ? applyUpdate(branchAgent) : branchAgent;

    expect(savedAgent.flowNodes.find((node: { id: string }) => node.id === "router")?.y).toBe(0);
    expect(savedAgent.flowNodes.find((node: { id: string }) => node.id === "state_2")?.y).toBe(186);
    expect(savedAgent.flowNodes.find((node: { id: string }) => node.id === "state_3")?.y).toBe(186);
  });
});
