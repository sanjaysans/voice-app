"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createActiveCall,
  createAgent,
  dateRanges,
  demoScenarios,
  getTimeLabel,
  initialAgents,
  initialCallHistory,
  initialConnections,
  initialNotifications,
  type ActiveCall,
  type Agent,
  type CallRecord,
  type Connection,
  type DemoScenario,
  type NotificationItem,
} from "@/lib/mock-data";

type CallsView = "launch" | "live" | "review";

type MockAppContextValue = {
  tenantSlug: string;
  workspaceId: string;
  workspaceName: string;
  agents: Agent[];
  selectedAgentId: string;
  selectedAgent: Agent;
  connections: Connection[];
  activeCall: ActiveCall | null;
  callHistory: CallRecord[];
  selectedCallId: string;
  selectedCall: CallRecord;
  callsView: CallsView;
  notifications: NotificationItem[];
  scenarios: DemoScenario[];
  dateRange: string;
  selectAgent: (agentId: string) => void;
  reloadWorkspaceContext: (preferredWorkspaceId?: string) => Promise<void>;
  createNewAgent: (name?: string) => Promise<Agent>;
  deleteAgent: (agentId: string) => Promise<void>;
  updateAgent: (agentId: string, updater: (agent: Agent) => Agent) => Promise<void>;
  updateFlowNode: (
    agentId: string,
    nodeId: string,
    field: "label" | "state" | "prompt",
    value: string
  ) => Promise<void>;
  updateNodeVendor: (
    agentId: string,
    nodeId: string,
    vendor: "stt" | "llm" | "tts",
    value: string
  ) => Promise<void>;
  toggleTool: (agentId: string, toolId: string) => Promise<void>;
  toggleKnowledge: (agentId: string, sourceId: string) => Promise<void>;
  publishAgent: (agentId: string) => Promise<void>;
  toggleConnection: (connectionId: string) => Promise<void>;
  updateConnection: (
    connectionId: string,
    payload: {
      category: Connection["category"];
      vendor: string;
      name: string;
      description: string;
      status: Connection["status"];
      detail: string;
    }
  ) => Promise<void>;
  addConnection: (payload: {
    category: Connection["category"];
    vendor: string;
    name: string;
  }) => Promise<void>;
  deleteConnection: (connectionId: string) => Promise<void>;
  startCall: (payload: {
    agentId: string;
    scenarioId: string;
    leadName: string;
    company: string;
    phone: string;
  }) => void;
  setCallsView: (view: CallsView) => void;
  selectCall: (callId: string) => void;
  markSynced: (callId: string) => Promise<void>;
  deleteCall: (callId: string) => Promise<void>;
  dismissNotification: (notificationId: string) => void;
  setDateRange: (range: string) => void;
};

type WorkspaceRecord = {
  workspace_id: string;
  tenant_id: string;
  name: string;
  is_default: boolean;
};

type AgentStudioResponse = {
  agent_id: string;
  workspace_id: string;
  agent_key: string;
  name: string;
  description: string;
  status: "Draft" | "Published" | "Archived";
  status_tone: "warning" | "success" | "neutral";
  last_edited: string;
  segment: string;
  goal: string;
  stack: Agent["stack"];
  flow_nodes: Agent["flowNodes"];
  flow_edges: Agent["flowEdges"];
  tools_catalog: Agent["toolsCatalog"];
  knowledge_sources: Agent["knowledgeSources"];
  latest_version_number: number | null;
  latest_pipeline_mode: string | null;
};

type ConnectionResponse = {
  provider_account_id: string;
  category: Connection["category"];
  name: string;
  vendor: string;
  description: string;
  status: Connection["status"];
  tone: Connection["tone"];
  detail: string;
  last_checked: string;
};

type CallResponse = {
  call_id: string;
  agent_id: string | null;
  agent_name: string;
  lead_name: string;
  company: string;
  phone: string;
  scenario_name: string;
  status: CallRecord["status"];
  status_tone: CallRecord["statusTone"];
  duration: string;
  time: string;
  summary: string;
  outcome: string;
  next_step: string;
  vendor_trace: string;
  synced_to_crm: boolean;
  extracted_variables: Array<{ key: string; value: string }>;
  tool_calls: Array<{ name: string; result: string }>;
  guardrails: string[];
  transcript: Array<{ speaker: "Lead" | "Voice"; timestamp: string; text: string }>;
};

type AppStateResponse = {
  workspace: WorkspaceRecord;
  agents: AgentStudioResponse[];
  connections: ConnectionResponse[];
  calls: CallResponse[];
};

type TenantResponse = {
  tenant_slug: string;
  tenant_name: string;
};

const DEFAULT_TENANT = {
  slug: "voice-demo",
  name: "Voice Demo",
};

const DEFAULT_WORKSPACE_NAME = "Sales";
const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8100";
const MockAppContext = createContext<MockAppContextValue | null>(null);

function agentKeyFromName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function mapProviderKind(category: Connection["category"]) {
  switch (category) {
    case "Telephony":
      return "telephony";
    case "CRM":
      return "crm";
    case "Calendar":
      return "calendar";
    case "Knowledge":
      return "knowledge";
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function toAgent(response: AgentStudioResponse): Agent {
  return {
    id: response.agent_id,
    name: response.name,
    description: response.description,
    status: response.status === "Published" ? "Published" : "Draft",
    statusTone: response.status_tone === "success" ? "success" : "warning",
    lastEdited: response.last_edited,
    segment: response.segment,
    goal: response.goal,
    stack: response.stack,
    flowNodes: response.flow_nodes,
    flowEdges: response.flow_edges,
    toolsCatalog: response.tools_catalog,
    knowledgeSources: response.knowledge_sources,
  };
}

function toConnection(response: ConnectionResponse): Connection {
  return {
    id: response.provider_account_id,
    name: response.name,
    category: response.category,
    vendor: response.vendor,
    description: response.description,
    status: response.status,
    tone: response.tone,
    detail: response.detail,
    lastChecked: response.last_checked,
  };
}

function toCallRecord(response: CallResponse): CallRecord {
  return {
    id: response.call_id,
    agentId: response.agent_id ?? "",
    agentName: response.agent_name,
    leadName: response.lead_name,
    company: response.company,
    phone: response.phone,
    scenarioName: response.scenario_name,
    status: response.status,
    statusTone: response.status_tone,
    duration: response.duration,
    time: response.time,
    summary: response.summary,
    outcome: response.outcome,
    nextStep: response.next_step,
    vendorTrace: response.vendor_trace,
    syncedToCrm: response.synced_to_crm,
    extractedVariables: response.extracted_variables,
    toolCalls: response.tool_calls,
    guardrails: response.guardrails,
    transcript: response.transcript,
  };
}

async function ensureWorkspaceContext(): Promise<{
  tenantSlug: string;
  workspaceId: string;
}> {
  let tenants = await api<TenantResponse[]>("/api/v1/tenants");
  if (!tenants.length) {
    await api<TenantResponse>("/api/v1/tenants", {
      method: "POST",
      body: JSON.stringify({
        slug: DEFAULT_TENANT.slug,
        name: DEFAULT_TENANT.name,
        status: "active",
      }),
    });
    tenants = await api<TenantResponse[]>("/api/v1/tenants");
  }

  const tenant = tenants.find((item) => item.tenant_slug === DEFAULT_TENANT.slug) ?? tenants[0];
  let workspaces = await api<WorkspaceRecord[]>(
    `/api/v1/tenants/${tenant.tenant_slug}/workspaces`
  );
  if (!workspaces.length) {
    await api<WorkspaceRecord>(`/api/v1/tenants/${tenant.tenant_slug}/workspaces`, {
      method: "POST",
      body: JSON.stringify({ name: DEFAULT_WORKSPACE_NAME, is_default: true }),
    });
    workspaces = await api<WorkspaceRecord[]>(`/api/v1/tenants/${tenant.tenant_slug}/workspaces`);
  }

  const workspace = workspaces.find((item) => item.is_default) ?? workspaces[0];
  return { tenantSlug: tenant.tenant_slug, workspaceId: workspace.workspace_id };
}

async function resolveWorkspaceContext(preferredWorkspaceId?: string): Promise<{
  tenantSlug: string;
  workspaceId: string;
}> {
  const context = await ensureWorkspaceContext();
  if (!preferredWorkspaceId) {
    return context;
  }

  const workspaces = await api<WorkspaceRecord[]>(
    `/api/v1/tenants/${context.tenantSlug}/workspaces`
  );
  const workspace =
    workspaces.find((item) => item.workspace_id === preferredWorkspaceId) ??
    workspaces.find((item) => item.is_default) ??
    workspaces[0];

  return {
    tenantSlug: context.tenantSlug,
    workspaceId: workspace.workspace_id,
  };
}

export function MockAppProvider({ children }: { children: ReactNode }) {
  const [tenantSlug, setTenantSlug] = useState(DEFAULT_TENANT.slug);
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState(DEFAULT_WORKSPACE_NAME);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [callsView, setCallsView] = useState<CallsView>("launch");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [dateRange, setDateRange] = useState(dateRanges[1]);
  const [isReady, setIsReady] = useState(false);
  const initializedRef = useRef(false);

  async function refreshState(context?: { tenantSlug: string; workspaceId: string }) {
    const currentTenantSlug = context?.tenantSlug ?? tenantSlug;
    const currentWorkspaceId = context?.workspaceId ?? workspaceId;
    const state = await api<AppStateResponse>(
      `/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/app-state`
    );
    const nextAgents = state.agents.map(toAgent);
    const nextConnections = state.connections.map(toConnection);
    const nextCalls = state.calls.map(toCallRecord);

    setAgents(nextAgents);
    setConnections(nextConnections);
    setCallHistory(nextCalls);
    setWorkspaceName(state.workspace.name);
    setSelectedAgentId((current) =>
      nextAgents.some((agent) => agent.id === current) ? current : nextAgents[0]?.id || ""
    );
    setSelectedCallId((current) =>
      nextCalls.some((call) => call.id === current) ? current : nextCalls[0]?.id || ""
    );
    console.info("voice.refreshState", {
      tenant: currentTenantSlug,
      workspace: currentWorkspaceId,
      agents: nextAgents.length,
      connections: nextConnections.length,
      calls: nextCalls.length,
    });
  }

  async function bootstrapWorkspace(currentTenantSlug: string, currentWorkspaceId: string) {
    const state = await api<AppStateResponse>(
      `/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/app-state`
    );
    const createdAgents: Array<{ source: Agent; id: string }> = [];

    if (!state.agents.length) {
      for (const agent of initialAgents) {
        const created = await api<AgentStudioResponse>(
          `/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/agents`,
          {
            method: "POST",
            body: JSON.stringify({
              agent_key: agentKeyFromName(agent.name),
              name: agent.name,
              status: agent.status.toLowerCase(),
              initial_version: {
                pipeline_mode: "stt_llm_tts",
                routing_config: {},
                vendor_config: { stack: agent.stack },
              },
            }),
          }
        );
        await api<AgentStudioResponse>(
          `/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/agents/${created.agent_id}/studio`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: agent.name,
              description: agent.description,
              status: agent.status.toLowerCase(),
              segment: agent.segment,
              goal: agent.goal,
              stack: agent.stack,
              flow_nodes: agent.flowNodes,
              flow_edges: agent.flowEdges,
              tools_catalog: agent.toolsCatalog,
              knowledge_sources: agent.knowledgeSources,
              pipeline_mode: "stt_llm_tts",
            }),
          }
        );
        createdAgents.push({ source: agent, id: created.agent_id });
      }
    }

    if (!state.connections.length) {
      for (const connection of initialConnections) {
        await api(`/api/v1/tenants/${currentTenantSlug}/provider-accounts`, {
          method: "POST",
          body: JSON.stringify({
            provider_kind: mapProviderKind(connection.category),
            vendor_name: connection.vendor,
            label: connection.name,
            status: connection.status === "Connected" ? "active" : "draft",
            config: {
              name: connection.name,
              description: connection.description,
              ui_status: connection.status,
              detail: connection.detail,
              last_checked: connection.lastChecked,
            },
          }),
        });
      }
    }

    if (state.calls.length) {
      return;
    }

    const agentsForCalls =
      createdAgents.length > 0
        ? createdAgents
        : (await api<AppStateResponse>(
            `/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/app-state`
          )).agents.map((agent) => ({
            source: initialAgents.find((item) => item.name === agent.name) ?? initialAgents[0],
            id: agent.agent_id,
          }));

    for (const call of initialCallHistory) {
      const agentId = agentsForCalls.find((item) => item.source.name === call.agentName)?.id;
      if (!agentId) {
        continue;
      }
      await api(`/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/calls`, {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
          lead_name: call.leadName,
          company: call.company,
          phone: call.phone,
          scenario_name: call.scenarioName,
          status: call.status,
          duration: call.duration,
          summary: call.summary,
          outcome: call.outcome,
          next_step: call.nextStep,
          vendor_trace: call.vendorTrace,
          synced_to_crm: call.syncedToCrm,
          extracted_variables: call.extractedVariables,
          tool_calls: call.toolCalls,
          guardrails: call.guardrails,
          transcript: call.transcript,
        }),
      });
    }
  }

  async function loadWorkspace(preferredWorkspaceId?: string) {
    const context = await resolveWorkspaceContext(preferredWorkspaceId);
    setTenantSlug(context.tenantSlug);
    setWorkspaceId(context.workspaceId);
    await bootstrapWorkspace(context.tenantSlug, context.workspaceId);
    await refreshState(context);
    console.info("voice.initialize.ready", context);
    setIsReady(true);
  }

  useEffect(() => {
    async function initialize() {
      if (initializedRef.current) {
        return;
      }
      initializedRef.current = true;
      try {
        await loadWorkspace();
      } catch (error) {
        console.error("workspace initialization failed", error);
      }
    }

    void initialize();
  }, []);

  useEffect(() => {
    if (!activeCall || !workspaceId) {
      return;
    }

    if (activeCall.phaseIndex >= activeCall.phases.length - 1) {
      const finalizeTimer = window.setTimeout(() => {
        void (async () => {
          const agent = agents.find((item) => item.id === activeCall.agentId);
          const scenario = demoScenarios.find((item) => item.id === activeCall.scenarioId);

          if (!agent || !scenario) {
            setActiveCall(null);
            return;
          }

          const created = await api<CallResponse>(
            `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/calls`,
            {
              method: "POST",
              body: JSON.stringify({
                agent_id: activeCall.agentId,
                lead_name: activeCall.leadName,
                company: activeCall.company,
                phone: activeCall.phone,
                scenario_name: activeCall.scenarioName,
                status:
                  scenario.outcome === "Voicemail"
                    ? "Dropped"
                    : scenario.outcome === "Follow-up"
                      ? "Follow-up"
                      : "Completed",
                duration: `0${activeCall.phases.length}:1${activeCall.transcript.length}`,
                summary: `${scenario.summary} This run used the ${agent.name} workflow and completed the configured next-step routing.`,
                outcome: scenario.outcome,
                next_step: scenario.nextStep,
                vendor_trace: `${agent.stack.stt} -> ${agent.stack.llm} -> ${agent.stack.tts}`,
                synced_to_crm: false,
                extracted_variables: scenario.extractedVariables,
                tool_calls: scenario.toolCalls,
                guardrails: scenario.guardrails,
                transcript: activeCall.transcript,
              }),
            }
          );
          const record = toCallRecord(created);
          await refreshState();
          setSelectedCallId(record.id);
          setCallsView("review");
          setActiveCall(null);
          setNotifications((current) => [
            {
              id: `note_${Date.now()}`,
              title: `${record.agentName} completed a call`,
              message: `${record.leadName} from ${record.company} is ready for review.`,
              tone: record.statusTone === "danger" ? "warning" : "success",
              href: "/calls",
            },
            ...current,
          ]);
        })();
      }, 1100);

      return () => window.clearTimeout(finalizeTimer);
    }

    const stepTimer = window.setTimeout(() => {
      setActiveCall((current) => {
        if (!current) {
          return current;
        }

        const scenario = demoScenarios.find((item) => item.id === current.scenarioId);
        if (!scenario) {
          return current;
        }

        const nextPhaseIndex = current.phaseIndex + 1;
        const nextTranscriptSeed = scenario.transcriptSeed[nextPhaseIndex];
        const transcript =
          nextTranscriptSeed && current.transcript.length <= nextPhaseIndex
            ? [
                ...current.transcript,
                {
                  ...nextTranscriptSeed,
                  timestamp: `0${Math.min(nextPhaseIndex + 1, 9)}:${(nextPhaseIndex * 14 + 5)
                    .toString()
                    .padStart(2, "0")}`,
                },
              ]
            : current.transcript;

        return {
          ...current,
          phaseIndex: nextPhaseIndex,
          timeline: [...current.timeline, `${getTimeLabel()} • ${current.phases[nextPhaseIndex]}`],
          transcript,
        };
      });
    }, 1300);

    return () => window.clearTimeout(stepTimer);
  }, [activeCall, agents, tenantSlug, workspaceId]);

  async function patchAgent(agentId: string, nextAgent: Agent) {
    await api(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/agents/${agentId}/studio`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: nextAgent.name,
          description: nextAgent.description,
          status: nextAgent.status.toLowerCase(),
          segment: nextAgent.segment,
          goal: nextAgent.goal,
          stack: nextAgent.stack,
          flow_nodes: nextAgent.flowNodes,
          flow_edges: nextAgent.flowEdges,
          tools_catalog: nextAgent.toolsCatalog,
          knowledge_sources: nextAgent.knowledgeSources,
          pipeline_mode: "stt_llm_tts",
        }),
      }
    );
    await refreshState();
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0];
  const selectedCall = callHistory.find((call) => call.id === selectedCallId) ?? callHistory[0];

  const value = useMemo<MockAppContextValue>(
    () => ({
      tenantSlug,
      workspaceId,
      workspaceName,
      agents,
      selectedAgentId,
      selectedAgent,
      connections,
      activeCall,
      callHistory,
      selectedCallId,
      selectedCall,
      callsView,
      notifications,
      scenarios: demoScenarios,
      dateRange,
      selectAgent: setSelectedAgentId,
      reloadWorkspaceContext: loadWorkspace,
      createNewAgent: async (name = "New conversion flow") => {
        const template = createAgent(name);
        const created = await api<AgentStudioResponse>(
          `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/agents`,
          {
            method: "POST",
            body: JSON.stringify({
              agent_key: agentKeyFromName(name),
              name,
              status: "draft",
              initial_version: {
                pipeline_mode: "stt_llm_tts",
                routing_config: {
                  flow_nodes: template.flowNodes,
                  flow_edges: template.flowEdges,
                },
                vendor_config: {
                  stack: template.stack,
                },
              },
            }),
          }
        );
        await api<AgentStudioResponse>(
          `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/agents/${created.agent_id}/studio`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: template.name,
              description: template.description,
              status: "draft",
              segment: template.segment,
              goal: template.goal,
              stack: template.stack,
              flow_nodes: template.flowNodes,
              flow_edges: template.flowEdges,
              tools_catalog: template.toolsCatalog,
              knowledge_sources: template.knowledgeSources,
              pipeline_mode: "stt_llm_tts",
            }),
          }
        );
        await refreshState();
        setSelectedAgentId(created.agent_id);
        return { ...template, id: created.agent_id };
      },
      deleteAgent: async (agentId) => {
        await api(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/agents/${agentId}`, {
          method: "DELETE",
        });
        await refreshState();
      },
      updateAgent: async (agentId, updater) => {
        const current = agents.find((agent) => agent.id === agentId);
        if (!current) {
          return;
        }
        await patchAgent(agentId, updater(current));
      },
      updateFlowNode: async (agentId, nodeId, field, value) => {
        const current = agents.find((agent) => agent.id === agentId);
        if (!current) {
          return;
        }
        await patchAgent(agentId, {
          ...current,
          lastEdited: "Just now",
          flowNodes: current.flowNodes.map((node) =>
            node.id === nodeId ? { ...node, [field]: value } : node
          ),
        });
      },
      updateNodeVendor: async (agentId, nodeId, vendor, value) => {
        const current = agents.find((agent) => agent.id === agentId);
        if (!current) {
          return;
        }
        await patchAgent(agentId, {
          ...current,
          lastEdited: "Just now",
          stack: { ...current.stack, [vendor]: value },
          flowNodes: current.flowNodes.map((node) =>
            node.id === nodeId
              ? { ...node, vendors: { ...node.vendors, [vendor]: value } }
              : node
          ),
        });
      },
      toggleTool: async (agentId, toolId) => {
        const current = agents.find((agent) => agent.id === agentId);
        if (!current) {
          return;
        }
        await patchAgent(agentId, {
          ...current,
          lastEdited: "Just now",
          toolsCatalog: current.toolsCatalog.map((tool) =>
            tool.id === toolId ? { ...tool, enabled: !tool.enabled } : tool
          ),
        });
      },
      toggleKnowledge: async (agentId, sourceId) => {
        const current = agents.find((agent) => agent.id === agentId);
        if (!current) {
          return;
        }
        await patchAgent(agentId, {
          ...current,
          lastEdited: "Just now",
          knowledgeSources: current.knowledgeSources.map((source) =>
            source.id === sourceId ? { ...source, enabled: !source.enabled } : source
          ),
        });
      },
      publishAgent: async (agentId) => {
        const current = agents.find((agent) => agent.id === agentId);
        if (!current) {
          return;
        }
        await patchAgent(agentId, {
          ...current,
          status: "Published",
          statusTone: "success",
          lastEdited: "Just now",
        });
        setNotifications((currentItems) => [
          {
            id: `note_${Date.now()}`,
            title: "Agent published",
            message: "The workflow is published and ready for new call traffic.",
            tone: "success",
            href: "/agents/builder",
          },
          ...currentItems,
        ]);
      },
      toggleConnection: async (connectionId) => {
        const current = connections.find((connection) => connection.id === connectionId);
        if (!current) {
          return;
        }
        const nextConnection =
          current.status === "Connected"
            ? {
                ...current,
                status: "Warning" as const,
                tone: "warning" as const,
                detail: `${current.vendor} health check surfaced an issue that needs review.`,
                lastChecked: `Warning ${getTimeLabel()}`,
              }
            : {
                ...current,
                status: "Connected" as const,
                tone: "success" as const,
                detail: `${current.vendor} connection is healthy and ready for new traffic.`,
                lastChecked: `Healthy ${getTimeLabel()}`,
              };
        await api(`/api/v1/tenants/${tenantSlug}/provider-accounts/${connectionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: nextConnection.status === "Connected" ? "active" : "error",
            config: {
              name: nextConnection.name,
              description: nextConnection.description,
              ui_status: nextConnection.status,
              detail: nextConnection.detail,
              last_checked: nextConnection.lastChecked,
            },
          }),
        });
        await refreshState();
      },
      updateConnection: async (connectionId, payload) => {
        await api(`/api/v1/tenants/${tenantSlug}/provider-accounts/${connectionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            provider_kind: mapProviderKind(payload.category),
            vendor_name: payload.vendor,
            label: payload.name,
            status: payload.status === "Connected" ? "active" : payload.status === "Warning" ? "error" : "draft",
            config: {
              name: payload.name,
              description: payload.description,
              ui_status: payload.status,
              detail: payload.detail,
              last_checked: payload.status === "Connected" ? `Healthy ${getTimeLabel()}` : `Updated ${getTimeLabel()}`,
            },
          }),
        });
        await refreshState();
      },
      addConnection: async ({ category, vendor, name }) => {
        await api(`/api/v1/tenants/${tenantSlug}/provider-accounts`, {
          method: "POST",
          body: JSON.stringify({
            provider_kind: mapProviderKind(category),
            vendor_name: vendor,
            label: name,
            status: "active",
            config: {
              name,
              description: `${vendor} connection for ${category.toLowerCase()} workflows.`,
              ui_status: "Connected",
              detail: `${vendor} was added and is ready for workflow setup.`,
              last_checked: `Healthy ${getTimeLabel()}`,
            },
          }),
        });
        await refreshState();
        setNotifications((currentItems) => [
          {
            id: `note_${Date.now()}`,
            title: "Connection added",
            message: `${name} is now available in the connections workspace.`,
            tone: "success",
            href: "/connections",
          },
          ...currentItems,
        ]);
      },
      deleteConnection: async (connectionId) => {
        await api(`/api/v1/tenants/${tenantSlug}/provider-accounts/${connectionId}`, {
          method: "DELETE",
        });
        await refreshState();
      },
      startCall: ({ agentId, scenarioId, leadName, company, phone }) => {
        const agent = agents.find((item) => item.id === agentId) ?? agents[0];
        const scenario = demoScenarios.find((item) => item.id === scenarioId) ?? demoScenarios[0];
        if (!agent) {
          return;
        }
        const call = createActiveCall({
          agent,
          scenario,
          leadName: leadName.trim() || scenario.leadName,
          company: company.trim() || scenario.company,
          phone: phone.trim() || scenario.phone,
        });
        setSelectedAgentId(agent.id);
        setActiveCall(call);
        setCallsView("live");
      },
      setCallsView,
      selectCall: (callId) => {
        setSelectedCallId(callId);
        setCallsView("review");
      },
      markSynced: async (callId) => {
        await api(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/calls/${callId}`, {
          method: "PATCH",
          body: JSON.stringify({
            synced_to_crm: true,
            next_step: "Synced to CRM timeline and owner notified.",
          }),
        });
        await refreshState();
        setNotifications((currentItems) => [
          {
            id: `note_${Date.now()}`,
            title: "CRM sync completed",
            message: "The selected call was written back to the CRM timeline.",
            tone: "success",
            href: "/calls",
          },
          ...currentItems,
        ]);
      },
      deleteCall: async (callId) => {
        if (callHistory.length <= 1) {
          return;
        }
        await api(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/calls/${callId}`, {
          method: "DELETE",
        });
        await refreshState();
        setCallsView("launch");
      },
      dismissNotification: (notificationId) => {
        setNotifications((current) =>
          current.filter((notification) => notification.id !== notificationId)
        );
      },
      setDateRange,
    }),
    [
      activeCall,
      agents,
      callHistory,
      callsView,
      connections,
      dateRange,
      notifications,
      selectedAgent,
      selectedAgentId,
      selectedCall,
      selectedCallId,
      tenantSlug,
      workspaceId,
      workspaceName,
    ]
  );

  if (!isReady || !selectedAgent || !selectedCall) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-[#6D6D78]">
        Loading workspace...
      </div>
    );
  }

  return <MockAppContext.Provider value={value}>{children}</MockAppContext.Provider>;
}

export function useMockApp() {
  const context = useContext(MockAppContext);

  if (!context) {
    throw new Error("useMockApp must be used within MockAppProvider");
  }

  return context;
}
