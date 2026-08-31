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
import { usePathname, useRouter } from "next/navigation";
import {
  createAgent,
  type AgentCreationMode,
  dateRanges,
  type Agent,
  type AgentVariable,
  type FlowEdge,
  type CallRecord,
  type Connection,
  type NotificationItem,
} from "@/lib/mock-data";
import { ApiError, api } from "@/lib/api-client";
import {
  getProviderLabel,
  buildDefaultRuntimeProfile,
  mergeRuntimeProfile,
  parsePhoneNumbers,
  resolveProviderHealthCheckEndpoint,
  type AgentRuntimeProfile,
  type ProviderAccountRecord,
  type SupportedProviderKind,
} from "@/lib/voice-stack";
import { Button } from "@/components/ui";

type RouteDataScope = "light" | "agents" | "providers" | "full";

type MockAppContextValue = {
  currentUser: {
    id: string;
    email: string;
    displayName: string;
    isPlatformAdmin: boolean;
    role: string;
  } | null;
  tenantSlug: string;
  workspaceId: string;
  workspaceName: string;
  workspaceOptions: Array<{
    workspace_id: string;
    name: string;
    is_default: boolean;
  }>;
  agents: Agent[];
  selectedAgentId: string;
  selectedAgent: Agent | null;
  connections: Connection[];
  providerAccounts: ProviderAccountRecord[];
  callHistory: CallRecord[];
  selectedCallId: string;
  selectedCall: CallRecord | null;
  notifications: NotificationItem[];
  isRouteDataLoading: boolean;
  routeDataError: string;
  retryRouteData: () => Promise<void>;
  dateRange: string;
  selectAgent: (agentId: string) => void;
  reloadWorkspaceContext: (preferredWorkspaceId?: string) => Promise<void>;
  signOut: () => Promise<void>;
  createNewAgent: (name?: string, mode?: AgentCreationMode) => Promise<Agent>;
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
      providerKind: SupportedProviderKind;
      vendorName: string;
      label: string;
      status: "draft" | "active" | "inactive" | "error" | "configured";
      config: Record<string, unknown>;
    }
  ) => Promise<void>;
  addConnection: (payload: {
    providerKind: SupportedProviderKind;
    vendorName: string;
    label: string;
    status: "draft" | "active" | "inactive" | "error" | "configured";
    config: Record<string, unknown>;
  }) => Promise<void>;
  deleteConnection: (connectionId: string) => Promise<void>;
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
  shared_prompt?: string;
  status: "Draft" | "Published" | "Archived";
  status_tone: "warning" | "success" | "neutral";
  last_edited: string;
  segment: string;
  goal: string;
  stack: Agent["stack"];
  flow_nodes: Array<Omit<Agent["flowNodes"][number], "nodeType"> & { node_type?: "state" | "end_call" }>;
  flow_edges: Array<{
    id: string;
    source_id: string;
    target_id: string;
    label: string;
    condition: string;
  }>;
  tools_catalog: Agent["toolsCatalog"];
  knowledge_sources: Agent["knowledgeSources"];
  latest_version_number: number | null;
  latest_pipeline_mode: string | null;
  runtime_profile?: AgentRuntimeProfile;
  variables?: Array<{
    key: string;
    label: string;
    description: string;
    data_type: AgentVariable["dataType"];
    required: boolean;
    default_value?: string | number | boolean | null;
    options: string[];
  }>;
};

type AgentSummaryResponse = {
  agent_id: string;
  workspace_id: string;
  agent_key: string;
  name: string;
  status: string;
  latest_version_number: number | null;
  latest_pipeline_mode: string | null;
};

type ProviderAccountResponse = {
  provider_account_id: string;
  provider_kind: SupportedProviderKind;
  vendor_name: string;
  label: string;
  status: "draft" | "active" | "inactive" | "error" | "configured";
  has_config: boolean;
  config_keys: string[];
  preview: Record<string, unknown>;
};

type CallResponse = {
  call_id: string;
  agent_id: string | null;
  is_test?: boolean;
  direction?: string;
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
  created_at?: string;
  started_at?: string | null;
  ended_at?: string | null;
};

type AppStateResponse = {
  workspace: WorkspaceRecord;
  agents: AgentStudioResponse[];
  provider_accounts: ProviderAccountResponse[];
  calls: CallResponse[];
};

type TenantResponse = {
  tenant_slug: string;
  tenant_name: string;
};

type SessionMembershipResponse = {
  membership_id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  workspace_id: string;
  workspace_name: string;
  workspace_is_default: boolean;
  role: "admin" | "editor" | "viewer";
};

type SessionResponse = {
  user: {
    user_id: string;
    email: string;
    display_name: string;
    is_platform_admin: boolean;
  };
  memberships: SessionMembershipResponse[];
  active_membership: SessionMembershipResponse | null;
};

const MockAppContext = createContext<MockAppContextValue | null>(null);
const routeDataScopeRank: Record<RouteDataScope, number> = {
  light: 0,
  agents: 1,
  providers: 2,
  full: 3,
};

function getRouteDataScope(pathname: string): RouteDataScope {
  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/agents") ||
    pathname.startsWith("/live") ||
    pathname.startsWith("/compliance")
  ) {
    return "full";
  }
  if (pathname.startsWith("/evaluations")) {
    return "agents";
  }
  if (pathname.startsWith("/connections")) {
    return "providers";
  }
  return "light";
}

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

function toProviderAccount(response: ProviderAccountResponse): ProviderAccountRecord {
  return {
    id: response.provider_account_id,
    providerKind: response.provider_kind,
    vendorName: response.vendor_name,
    label: response.label,
    status: response.status,
    hasConfig: response.has_config,
    configKeys: response.config_keys,
    preview: response.preview,
  };
}

function providerKindToCategory(kind: SupportedProviderKind): Connection["category"] {
  switch (kind) {
    case "telephony":
      return "Telephony";
    case "stt":
      return "Speech to text";
    case "llm":
      return "Reasoning";
    case "tts":
      return "Text to speech";
  }
}

function statusFromProviderAccount(account: ProviderAccountRecord): Connection["status"] {
  const uiStatus = String(account.preview.ui_status || "").trim();
  if (uiStatus === "Connected") {
    return "Connected";
  }
  if (uiStatus === "Warning") {
    return "Warning";
  }
  return account.status === "active" || account.status === "configured"
    ? "Connected"
    : account.status === "error"
      ? "Warning"
      : "Needs setup";
}

function toneFromConnectionStatus(status: Connection["status"]): Connection["tone"] {
  return status === "Connected" ? "success" : status === "Warning" ? "warning" : "neutral";
}

function toConnectionFromProviderAccount(account: ProviderAccountRecord): Connection {
  const status = statusFromProviderAccount(account);
  return {
    id: account.id,
    name: account.label,
    category: providerKindToCategory(account.providerKind),
    vendor: getProviderLabel(account.providerKind, account.vendorName),
    description: `${getProviderLabel(account.providerKind, account.vendorName)} ${account.providerKind} connection`,
    status,
    tone: toneFromConnectionStatus(status),
    detail: String(account.preview.detail || "Connection ready for setup."),
    lastChecked: String(account.preview.last_checked || "Not configured"),
  };
}

function toFlowEdge(edge: AgentStudioResponse["flow_edges"][number]): FlowEdge {
  return {
    id: edge.id,
    sourceId: edge.source_id,
    targetId: edge.target_id,
    label: edge.label,
    condition: edge.condition,
  };
}

function fromFlowEdge(edge: FlowEdge) {
  return {
    id: edge.id,
    source_id: edge.sourceId,
    target_id: edge.targetId,
    label: edge.label,
    condition: edge.condition,
  };
}

function fromFlowNode(node: Agent["flowNodes"][number]) {
  return {
    ...node,
    node_type: node.nodeType ?? "state",
    nodeType: undefined,
  };
}

function toAgentVariable(variable: NonNullable<AgentStudioResponse["variables"]>[number]): AgentVariable {
  return {
    key: variable.key,
    label: variable.label,
    description: variable.description,
    dataType: variable.data_type,
    required: variable.required,
    ...(variable.default_value === null || variable.default_value === undefined
      ? {}
      : { defaultValue: variable.default_value }),
    options: variable.options,
  };
}

function fromAgentVariable(variable: AgentVariable) {
  return {
    key: variable.key,
    label: variable.label,
    description: variable.description,
    data_type: variable.dataType,
    required: variable.required,
    default_value: variable.defaultValue ?? null,
    options: variable.options,
  };
}

function toAgent(response: AgentStudioResponse): Agent {
  return {
    id: response.agent_id,
    name: response.name,
    description: response.description,
    sharedPrompt: response.shared_prompt || "",
    status: response.status === "Published" ? "Published" : "Draft",
    statusTone: response.status_tone === "success" ? "success" : "warning",
    lastEdited: response.last_edited,
    segment: response.segment,
    goal: response.goal,
    stack: response.stack,
    variables: (response.variables ?? []).map(toAgentVariable),
    runtimeProfile: mergeRuntimeProfile(response.runtime_profile),
    flowNodes: response.flow_nodes.map((node) => ({
      ...node,
      nodeType: node.node_type ?? "state",
    })),
    flowEdges: response.flow_edges.map(toFlowEdge),
    toolsCatalog: response.tools_catalog,
    knowledgeSources: response.knowledge_sources,
  };
}

function toAgentSummary(response: AgentSummaryResponse): Agent {
  const isPublished = response.status.toLowerCase() === "published";
  return {
    id: response.agent_id,
    name: response.name,
    description: "",
    sharedPrompt: "",
    status: isPublished ? "Published" : "Draft",
    statusTone: isPublished ? "success" : "warning",
    lastEdited: "",
    segment: "",
    goal: "",
    stack: { stt: "", llm: "", tts: "" },
    variables: [],
    runtimeProfile: buildDefaultRuntimeProfile(),
    flowNodes: [],
    flowEdges: [],
    toolsCatalog: [],
    knowledgeSources: [],
  };
}

function upsertAgent(currentAgents: Agent[], nextAgent: Agent) {
  const existingIndex = currentAgents.findIndex((agent) => agent.id === nextAgent.id);
  if (existingIndex === -1) {
    return [...currentAgents, nextAgent].sort((left, right) => left.name.localeCompare(right.name));
  }

  const updatedAgents = [...currentAgents];
  updatedAgents[existingIndex] = nextAgent;
  return updatedAgents;
}

function toCallRecord(response: CallResponse): CallRecord {
  return {
    id: response.call_id,
    isTest: response.is_test,
    createdAt: response.created_at,
    direction: response.direction,
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

export function MockAppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [currentUser, setCurrentUser] = useState<MockAppContextValue["currentUser"]>(null);
  const [tenantSlug, setTenantSlug] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceOptions, setWorkspaceOptions] = useState<MockAppContextValue["workspaceOptions"]>(
    []
  );
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccountRecord[]>([]);
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [dateRange, setDateRange] = useState(dateRanges[1]);
  const [isReady, setIsReady] = useState(false);
  const [isHydratingRouteData, setIsHydratingRouteData] = useState(false);
  const [routeDataError, setRouteDataError] = useState("");
  const [bootstrapError, setBootstrapError] = useState("");
  const activeContextRef = useRef({ tenantSlug: "", workspaceId: "" });
  const hydrationGenerationRef = useRef(0);
  const hydratedScopeRef = useRef<{
    tenantSlug: string;
    workspaceId: string;
    scope: RouteDataScope;
  } | null>(null);
  const routeDataScope = useMemo(() => getRouteDataScope(pathname), [pathname]);

  useEffect(() => {
    activeContextRef.current = { tenantSlug, workspaceId };
  }, [tenantSlug, workspaceId]);

  function applyProviderAccounts(nextProviderAccounts: ProviderAccountRecord[]) {
    setProviderAccounts(nextProviderAccounts);
    setConnections(nextProviderAccounts.map(toConnectionFromProviderAccount));
  }

  async function resolveSession(preferredWorkspaceId?: string): Promise<{
    currentUser: NonNullable<MockAppContextValue["currentUser"]>;
    tenantSlug: string;
    workspaceId: string;
    workspaceName: string;
  } | null> {
    const session = await api<SessionResponse>("/api/v1/auth/me");
    const memberships = session.memberships;
    const activeMembership =
      memberships.find((membership) => membership.workspace_id === preferredWorkspaceId) ??
      session.active_membership ??
      memberships.find((membership) => membership.workspace_is_default) ??
      memberships[0];

    setCurrentUser({
      id: session.user.user_id,
      email: session.user.email,
      displayName: session.user.display_name,
      isPlatformAdmin: session.user.is_platform_admin,
      role: activeMembership?.role ?? "admin",
    });
    setWorkspaceOptions(
      memberships.map((membership) => ({
        workspace_id: membership.workspace_id,
        name: membership.workspace_name,
        is_default: membership.workspace_is_default,
      }))
    );
    setBootstrapError("");

    if (!activeMembership) {
      return null;
    }

    return {
      currentUser: {
        id: session.user.user_id,
        email: session.user.email,
        displayName: session.user.display_name,
        isPlatformAdmin: session.user.is_platform_admin,
        role: activeMembership.role,
      },
      tenantSlug: activeMembership.tenant_slug,
      workspaceId: activeMembership.workspace_id,
      workspaceName: activeMembership.workspace_name,
    };
  }

  async function refreshState(context?: { tenantSlug: string; workspaceId: string }) {
    const currentTenantSlug = context?.tenantSlug ?? tenantSlug;
    const currentWorkspaceId = context?.workspaceId ?? workspaceId;
    if (!currentTenantSlug || !currentWorkspaceId) {
      setAgents([]);
      setConnections([]);
      setProviderAccounts([]);
      setCallHistory([]);
      setSelectedAgentId("");
      setSelectedCallId("");
      return;
    }
    const state = await api<AppStateResponse>(
      `/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/app-state`
    );
    const nextAgents = state.agents.map(toAgent);
    const nextProviderAccounts = state.provider_accounts.map(toProviderAccount);
    const nextCalls = state.calls.map(toCallRecord);

    if (
      activeContextRef.current.tenantSlug !== currentTenantSlug ||
      activeContextRef.current.workspaceId !== currentWorkspaceId
    ) {
      return;
    }

    setAgents(nextAgents);
    applyProviderAccounts(nextProviderAccounts);
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
      connections: nextProviderAccounts.length,
      calls: nextCalls.length,
    });
  }

  async function refreshAgents(context?: { tenantSlug: string; workspaceId: string }) {
    const currentTenantSlug = context?.tenantSlug ?? tenantSlug;
    const currentWorkspaceId = context?.workspaceId ?? workspaceId;
    if (!currentTenantSlug || !currentWorkspaceId) {
      setAgents([]);
      setSelectedAgentId("");
      return;
    }
    const state = await api<AgentSummaryResponse[]>(
      `/api/v1/tenants/${currentTenantSlug}/workspaces/${currentWorkspaceId}/agents`
    );
    const nextAgents = state.map(toAgentSummary);
    if (
      activeContextRef.current.tenantSlug !== currentTenantSlug ||
      activeContextRef.current.workspaceId !== currentWorkspaceId
    ) {
      return;
    }
    setAgents(nextAgents);
    setSelectedAgentId((current) =>
      nextAgents.some((agent) => agent.id === current) ? current : nextAgents[0]?.id || ""
    );
  }

  async function refreshProviderAccounts(context?: { tenantSlug: string }) {
    const currentTenantSlug = context?.tenantSlug ?? tenantSlug;
    if (!currentTenantSlug) {
      applyProviderAccounts([]);
      return;
    }

    const accounts = await api<ProviderAccountResponse[]>(
      `/api/v1/tenants/${currentTenantSlug}/provider-accounts`
    );
    if (activeContextRef.current.tenantSlug !== currentTenantSlug) {
      return;
    }
    applyProviderAccounts(accounts.map(toProviderAccount));
  }

  function hasHydratedRouteData(
    scope: RouteDataScope,
    context: { tenantSlug: string; workspaceId: string }
  ) {
    const hydrated = hydratedScopeRef.current;
    if (!hydrated) {
      return scope === "light";
    }
    return (
      hydrated.tenantSlug === context.tenantSlug &&
      hydrated.workspaceId === context.workspaceId &&
      routeDataScopeRank[hydrated.scope] >= routeDataScopeRank[scope]
    );
  }

  async function hydrateRouteData(
    scope: RouteDataScope,
    context: { tenantSlug: string; workspaceId: string }
  ) {
    if (scope === "light") {
      hydratedScopeRef.current = { ...context, scope };
      return;
    }
    if (hasHydratedRouteData(scope, context)) {
      return;
    }

    const requestContext = { ...context, scope };
    hydratedScopeRef.current = requestContext;
    const requestGeneration = ++hydrationGenerationRef.current;
    setIsHydratingRouteData(true);
    try {
      if (scope === "agents") {
        await refreshAgents(context);
      } else if (scope === "providers") {
        await refreshProviderAccounts({ tenantSlug: context.tenantSlug });
      } else {
        await refreshState(context);
      }
    } catch (error) {
      if (
        hydratedScopeRef.current?.tenantSlug === requestContext.tenantSlug &&
        hydratedScopeRef.current?.workspaceId === requestContext.workspaceId &&
        hydratedScopeRef.current?.scope === requestContext.scope
      ) {
        hydratedScopeRef.current = null;
      }
      throw error;
    } finally {
      if (hydrationGenerationRef.current === requestGeneration) {
        setIsHydratingRouteData(false);
      }
    }
  }

  async function loadWorkspace(preferredWorkspaceId?: string) {
    const resolved = await resolveSession(preferredWorkspaceId);
    if (!resolved) {
      setTenantSlug("");
      setWorkspaceId("");
      setWorkspaceName("");
      setWorkspaceOptions([]);
      setAgents([]);
      setConnections([]);
      setProviderAccounts([]);
      setCallHistory([]);
      setSelectedAgentId("");
      setSelectedCallId("");
      hydratedScopeRef.current = null;
      setBootstrapError("");
      setIsReady(true);
      return;
    }

    setCurrentUser(resolved.currentUser);
    setTenantSlug(resolved.tenantSlug);
    setWorkspaceId(resolved.workspaceId);
    setWorkspaceName(resolved.workspaceName);
    console.info("voice.initialize.ready", resolved);
    setIsReady(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadWorkspace();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
          return;
        }
        setBootstrapError("We couldn’t load the app context. Check backend connectivity or reseed the environment, then retry.");
        setIsReady(true);
        console.error("workspace initialization failed", error);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!isReady || !tenantSlug || !workspaceId) {
      return;
    }
    setRouteDataError("");
    void hydrateRouteData(routeDataScope, { tenantSlug, workspaceId }).catch((error) => {
      if (
        activeContextRef.current.tenantSlug === tenantSlug &&
        activeContextRef.current.workspaceId === workspaceId
      ) {
        setRouteDataError(
          error instanceof ApiError && error.status === 401
            ? "Your session expired. Sign in again to continue."
            : "We couldn’t load this surface. Check the backend and retry."
        );
      }
      console.error("route data hydration failed", error);
    });
  }, [isReady, routeDataScope, tenantSlug, workspaceId]);

  async function retryRouteData() {
    if (!tenantSlug || !workspaceId) {
      return;
    }
    setRouteDataError("");
    try {
      await hydrateRouteData(routeDataScope, { tenantSlug, workspaceId });
    } catch (error) {
      setRouteDataError("We couldn’t load this surface. Check the backend and retry.");
      console.error("route data retry failed", error);
    }
  }

  async function patchAgent(agentId: string, nextAgent: Agent) {
    const updated = await api<AgentStudioResponse>(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/agents/${agentId}/studio`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: nextAgent.name,
          description: nextAgent.description,
          status: nextAgent.status.toLowerCase(),
          segment: nextAgent.segment,
          goal: nextAgent.goal,
          shared_prompt: nextAgent.sharedPrompt,
          variables: nextAgent.variables.map(fromAgentVariable),
          stack: nextAgent.stack,
          runtime_profile: nextAgent.runtimeProfile,
          flow_nodes: nextAgent.flowNodes.map(fromFlowNode),
          flow_edges: nextAgent.flowEdges.map(fromFlowEdge),
          tools_catalog: nextAgent.toolsCatalog,
          knowledge_sources: nextAgent.knowledgeSources,
          pipeline_mode: "stt_llm_tts",
        }),
      }
    );
    const nextAgentRecord = toAgent(updated);
    setAgents((current) => upsertAgent(current, nextAgentRecord));
    setSelectedAgentId(nextAgentRecord.id);
  }

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const selectedCall = callHistory.find((call) => call.id === selectedCallId) ?? callHistory[0] ?? null;
  const value = useMemo<MockAppContextValue>(
    () => ({
      currentUser,
      tenantSlug,
      workspaceId,
      workspaceName,
      workspaceOptions,
      agents,
      selectedAgentId,
      selectedAgent,
      connections,
      providerAccounts,
      callHistory,
      selectedCallId,
      selectedCall,
      notifications,
      isRouteDataLoading: isHydratingRouteData,
      routeDataError,
      retryRouteData,
      dateRange,
      selectAgent: setSelectedAgentId,
      reloadWorkspaceContext: loadWorkspace,
      signOut: async () => {
        await api("/api/v1/auth/logout", { method: "POST" });
        setCurrentUser(null);
        router.replace("/login");
      },
      createNewAgent: async (name = "New conversion flow", mode = "template") => {
        const template = createAgent(name, mode);
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
                  flow_nodes: template.flowNodes.map(fromFlowNode),
                  flow_edges: template.flowEdges.map(fromFlowEdge),
                  variables: template.variables.map(fromAgentVariable),
                },
                vendor_config: {
                  stack: template.stack,
                  runtime_profile: template.runtimeProfile,
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
              shared_prompt: template.sharedPrompt,
              variables: template.variables.map(fromAgentVariable),
              status: "draft",
              segment: template.segment,
              goal: template.goal,
              stack: template.stack,
              runtime_profile: template.runtimeProfile,
              flow_nodes: template.flowNodes.map(fromFlowNode),
              flow_edges: template.flowEdges.map(fromFlowEdge),
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
            href: `/agents/${agentId}`,
          },
          ...currentItems,
        ]);
      },
      toggleConnection: async (connectionId) => {
        const current = providerAccounts.find((connection) => connection.id === connectionId);
        if (!current) {
          return;
        }
        const healthCheckPath = resolveProviderHealthCheckEndpoint(
          current.providerKind,
          current.vendorName,
          { tenantSlug, providerAccountId: connectionId }
        );
        await api(healthCheckPath, {
          method: "POST",
        });
        await refreshProviderAccounts();
      },
      updateConnection: async (connectionId, payload) => {
        await api(`/api/v1/tenants/${tenantSlug}/provider-accounts/${connectionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            provider_kind: payload.providerKind,
            vendor_name: payload.vendorName,
            label: payload.label,
            status: payload.status,
            config: payload.config,
          }),
        });
        await refreshProviderAccounts();
      },
      addConnection: async ({ providerKind, vendorName, label, status, config }) => {
        await api(`/api/v1/tenants/${tenantSlug}/provider-accounts`, {
          method: "POST",
          body: JSON.stringify({
            provider_kind: providerKind,
            vendor_name: vendorName,
            label,
            status,
            config,
          }),
        });
        await refreshProviderAccounts();
        setNotifications((currentItems) => [
          {
            id: `note_${Date.now()}`,
            title: "Connection added",
            message: `${label} was saved. Run a health check before using it in an agent.`,
            tone: "warning",
            href: "/connections",
          },
          ...currentItems,
        ]);
      },
      deleteConnection: async (connectionId) => {
        await api(`/api/v1/tenants/${tenantSlug}/provider-accounts/${connectionId}`, {
          method: "DELETE",
        });
        await refreshProviderAccounts();
      },
      selectCall: (callId) => {
        setSelectedCallId(callId);
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
            href: "/calls/logs",
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
      },
      dismissNotification: (notificationId) => {
        setNotifications((current) =>
          current.filter((notification) => notification.id !== notificationId)
        );
      },
      setDateRange,
    }),
    [
      agents,
      callHistory,
      connections,
      providerAccounts,
      currentUser,
      dateRange,
      notifications,
      router,
      selectedAgent,
      selectedAgentId,
      selectedCall,
      selectedCallId,
      tenantSlug,
      workspaceId,
      workspaceName,
      workspaceOptions,
    ]
  );

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-[#6D6D78]">
        Loading Voice...
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-xl rounded-[24px] border border-border bg-white p-8 text-center shadow-surface">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">App bootstrap</p>
          <h1 className="mt-4 text-2xl font-semibold text-[#17171F]">The app couldn’t finish loading</h1>
          <p className="mt-3 text-sm leading-6 text-[#6D6D78]">{bootstrapError}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => void loadWorkspace()}>Retry load</Button>
            <Button onClick={() => router.replace("/login")} variant="secondary">
              Back to login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!workspaceId || !tenantSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-xl rounded-[24px] border border-border bg-white p-8 text-center shadow-surface">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">Access required</p>
          <h1 className="mt-4 text-2xl font-semibold text-[#17171F]">No tenant membership is assigned yet</h1>
          <p className="mt-3 text-sm leading-6 text-[#6D6D78]">
            Your account is authenticated, but it does not have an active tenant membership yet. Add the first membership or reseed the environment, then try again.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => void loadWorkspace()} variant="secondary">
              Retry
            </Button>
            <Button onClick={() => void api("/api/v1/auth/logout", { method: "POST" }).then(() => router.replace("/login"))}>
              Sign out
            </Button>
          </div>
        </div>
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
