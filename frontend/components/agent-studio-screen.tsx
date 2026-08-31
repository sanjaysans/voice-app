"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { AgentFlowCanvas, autoArrangeFlowNodes } from "@/components/agent-flow-canvas";
import { ConfigFields } from "@/components/config-fields";
import { PromptEditor } from "@/components/prompt-editor";
import { useMockApp } from "@/lib/mock-app";
import type { Agent, AgentVariable, FlowEdge, VariableDataType } from "@/lib/mock-data";
import { useAsyncAction, useKeyedAsyncAction } from "@/lib/use-async-action";
import {
  Badge,
  Button,
  Card,
  ConfirmActionModal,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabs,
  Textarea,
} from "@/components/ui";
import {
  getAccountOptions,
  getProviderDefinition,
  getProviderLabel,
  getWorkflowLanguageOptions,
  getWorkflowSampleRateOptions,
  parsePhoneNumbers,
  resolveVendorLanguageCode,
  withResolvedRuntimeLanguages,
  type AgentRuntimeProfile,
  type SupportedProviderKind,
  type WorkflowLanguage,
} from "@/lib/voice-stack";

const editorTabs = [
  { id: "overview", label: "Overview", description: "Identity and goal" },
  { id: "workflow", label: "Workflow", description: "Prompts and variables" },
  { id: "telephony", label: "Telephony", description: "Call transport" },
  { id: "stt", label: "STT", description: "Speech recognition" },
  { id: "llm", label: "LLM", description: "Reasoning model" },
  { id: "tts", label: "TTS", description: "Voice synthesis" },
  { id: "states", label: "States", description: "Conversation map" },
] as const;

type EditorTab = (typeof editorTabs)[number]["id"];
type LeaveIntent = { type: "route"; href: string } | { type: "back" } | null;

const emptyVariable: AgentVariable = {
  key: "",
  label: "",
  description: "",
  dataType: "text",
  required: false,
  options: [],
};

function cloneAgent(agent: Agent) {
  return JSON.parse(JSON.stringify(agent)) as Agent;
}

function agentsEqual(left: Agent | null, right: Agent | null) {
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildTransitionDraft(sourceId: string, nodes: Agent["flowNodes"], edges: FlowEdge[]) {
  const takenTargets = new Set(edges.filter((edge) => edge.sourceId === sourceId).map((edge) => edge.targetId));
  const target = nodes.find((node) => node.id !== sourceId && !takenTargets.has(node.id));
  if (!target) {
    return null;
  }

  return {
    id: `edge_${sourceId}_${target.id}_${Math.random().toString(36).slice(2, 6)}`,
    sourceId,
    targetId: target.id,
    label: "Next state",
    condition: "",
  };
}

function buildNodeDraft(agent: Agent) {
  const nextIndex = agent.flowNodes.filter((node) => node.nodeType !== "end_call").length + 1;
  return {
    id: `state_${nextIndex}_${Math.random().toString(36).slice(2, 5)}`,
    label: nextIndex === 1 ? "Entry state" : `State ${nextIndex}`,
    x: 80 + ((nextIndex - 1) % 3) * 280,
    y: 120 + Math.floor((nextIndex - 1) / 3) * 180,
    tone: "neutral" as const,
    nodeType: "state" as const,
    state: nextIndex === 1 ? "Open the conversation" : "Define this step objective",
    prompt:
      nextIndex === 1
        ? "Open the conversation, confirm the caller's intent, and route to the right next state."
        : "Handle this step clearly, gather only what is needed, and transition when the exit condition is met.",
    tools: [],
    knowledge: [],
    vendors: { ...agent.stack },
  };
}

function findStateLabel(agent: Agent, stateId: string) {
  return agent.flowNodes.find((node) => node.id === stateId)?.label ?? "the next state";
}

function getResolvedLanguageLabel(kind: "stt" | "tts", vendor: string, language: WorkflowLanguage) {
  return resolveVendorLanguageCode(kind, vendor, language) || "Not mapped";
}

export function AgentStudioScreen({ agentId }: { agentId?: string }) {
  const router = useRouter();
  const {
    agents,
    selectedAgent,
    selectedAgentId,
    selectAgent,
    updateAgent,
    publishAgent,
    providerAccounts,
  } = useMockApp();
  const saveAction = useAsyncAction();
  const publishAction = useAsyncAction();
  const deleteAction = useKeyedAsyncAction();
  const historyGuardRef = useRef(false);
  const bypassNavigationGuardRef = useRef(false);

  const [selectedTab, setSelectedTab] = useState<EditorTab>("overview");
  const [draftAgent, setDraftAgent] = useState<Agent | null>(null);
  const [selectedStateId, setSelectedStateId] = useState("");
  const [transitionToDelete, setTransitionToDelete] = useState<FlowEdge | null>(null);
  const [stateToDelete, setStateToDelete] = useState<{ id: string; label: string } | null>(null);
  const [variableToDelete, setVariableToDelete] = useState<AgentVariable | null>(null);
  const [variableDraft, setVariableDraft] = useState(emptyVariable);
  const [variableOptionsInput, setVariableOptionsInput] = useState("");
  const [isVariableOpen, setIsVariableOpen] = useState(false);
  const [variableError, setVariableError] = useState("");
  const [leaveIntent, setLeaveIntent] = useState<LeaveIntent>(null);

  useEffect(() => {
    if (!agentId) {
      return;
    }
    if (selectedAgentId !== agentId) {
      selectAgent(agentId);
    }
  }, [agentId, selectAgent, selectedAgentId]);

  const activeAgent = useMemo(() => {
    if (agentId) {
      return agents.find((agent) => agent.id === agentId) ?? null;
    }
    return selectedAgent;
  }, [agentId, agents, selectedAgent]);

  useEffect(() => {
    if (!activeAgent) {
      setDraftAgent(null);
      setSelectedStateId("");
      return;
    }

    setDraftAgent(cloneAgent(activeAgent));
    setSelectedStateId((current) =>
      activeAgent.flowNodes.some((node) => node.id === current) ? current : activeAgent.flowNodes[0]?.id ?? ""
    );
  }, [activeAgent]);

  const isDirty = useMemo(
    () => (activeAgent && draftAgent ? !agentsEqual(activeAgent, draftAgent) : false),
    [activeAgent, draftAgent]
  );

  const selectedState =
    draftAgent?.flowNodes.find((node) => node.id === selectedStateId) ?? draftAgent?.flowNodes[0] ?? null;

  const outgoingTransitions =
    selectedState && draftAgent
      ? draftAgent.flowEdges.filter((edge) => edge.sourceId === selectedState.id)
      : [];

  function updateDraft(updater: (agent: Agent) => Agent) {
    setDraftAgent((current) => (current ? updater(current) : current));
  }

  function updateRuntimeSection<K extends keyof AgentRuntimeProfile>(
    section: K,
    updater: (value: AgentRuntimeProfile[K]) => AgentRuntimeProfile[K]
  ) {
    updateDraft((agent) => ({
      ...agent,
      runtimeProfile: withResolvedRuntimeLanguages({
        ...agent.runtimeProfile,
        [section]: updater(agent.runtimeProfile[section]),
      }),
    }));
  }

  function updateProviderSelection(kind: Exclude<SupportedProviderKind, "telephony">, providerAccountId: string) {
    const account = providerAccounts.find((item) => item.id === providerAccountId);

    updateDraft((agent) => ({
      ...agent,
      runtimeProfile: withResolvedRuntimeLanguages({
        ...agent.runtimeProfile,
        [kind]: {
          ...agent.runtimeProfile[kind],
          providerAccountId,
          vendor: account?.vendorName ?? agent.runtimeProfile[kind].vendor,
        },
      }),
      stack: {
        ...agent.stack,
        [kind]: account ? getProviderLabel(kind, account.vendorName) : agent.stack[kind],
      },
    }));
  }

  function updateTelephonyAccount(providerAccountId: string) {
    updateRuntimeSection("telephony", (telephony) => ({
      ...telephony,
      providerAccountId,
      phoneNumber: "",
    }));
  }

  function buildRuntimeFields(kind: SupportedProviderKind) {
    if (!draftAgent) {
      return [];
    }

    if (kind === "telephony") {
      const account = providerAccounts.find(
        (item) => item.id === draftAgent.runtimeProfile.telephony.providerAccountId
      );
      const definition = getProviderDefinition("telephony", account?.vendorName || "twilio");
      const phoneNumbers = parsePhoneNumbers(account?.preview.phone_numbers).map((item) => ({
        label: item,
        value: item,
      }));

      return (definition?.runtimeFields ?? []).map((field) =>
        field.id === "phoneNumber" ? { ...field, options: phoneNumbers } : field
      );
    }

    const account = providerAccounts.find((item) => item.id === draftAgent.runtimeProfile[kind].providerAccountId);
    const definition = getProviderDefinition(
      kind,
      account?.vendorName || (kind === "stt" ? "deepgram" : kind === "llm" ? "openai" : "cartesia")
    );

    return (definition?.runtimeFields ?? []).map((field) => {
      if (field.id === "model") {
        return { ...field, options: definition?.models ?? [] };
      }
      if (field.id === "voiceId") {
        return { ...field, options: definition?.voices ?? [] };
      }
      return field;
    });
  }

  function updateWorkflowLanguage(language: WorkflowLanguage) {
    updateRuntimeSection("workflow", (workflow) => ({
      ...workflow,
      defaultLanguage: language,
    }));
  }

  function updateWorkflowSampleRate(sampleRate: 8000 | 16000 | 24000) {
    updateRuntimeSection("workflow", (workflow) => ({
      ...workflow,
      sampleRate,
    }));
  }

  function addState() {
    if (!draftAgent) {
      return;
    }
    const nextState = buildNodeDraft(draftAgent);
    setSelectedStateId(nextState.id);
    updateDraft((agent) => ({
      ...agent,
      flowNodes: [...agent.flowNodes, nextState],
    }));
  }

  function autoOrganizeStates() {
    updateDraft((agent) => ({
      ...agent,
      flowNodes: autoArrangeFlowNodes(agent.flowNodes, agent.flowEdges),
    }));
  }

  function removeState(stateId: string) {
    if (draftAgent?.flowNodes.find((node) => node.id === stateId)?.nodeType === "end_call") {
      return;
    }
    updateDraft((agent) => ({
      ...agent,
      flowNodes: agent.flowNodes.filter((node) => node.id !== stateId),
      flowEdges: agent.flowEdges.filter((edge) => edge.sourceId !== stateId && edge.targetId !== stateId),
    }));
    setSelectedStateId((current) => (current === stateId ? "" : current));
  }

  function updateSelectedState(field: "label" | "state" | "prompt", value: string) {
    if (!selectedState) {
      return;
    }
    updateDraft((agent) => ({
      ...agent,
      flowNodes: agent.flowNodes.map((node) =>
        node.id === selectedState.id ? { ...node, [field]: value } : node
      ),
    }));
  }

  function openVariableModal() {
    setVariableDraft(emptyVariable);
    setVariableOptionsInput("");
    setVariableError("");
    setIsVariableOpen(true);
  }

  function addVariable() {
    const key = variableDraft.key.trim().toLowerCase();
    const label = variableDraft.label.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      setVariableError("Use lowercase letters, numbers, and underscores; start with a letter.");
      return;
    }
    if (!label) {
      setVariableError("Add a display label for this variable.");
      return;
    }
    if (draftAgent?.variables?.some((variable) => variable.key === key)) {
      setVariableError("That variable key already exists.");
      return;
    }
    if (variableDraft.dataType === "enum" && !variableOptionsInput.trim()) {
      setVariableError("Add at least one option for an enum variable.");
      return;
    }
    updateDraft((agent) => ({
      ...agent,
      variables: [
        ...(agent.variables ?? []),
        {
          ...variableDraft,
          key,
          label,
          description: variableDraft.description.trim(),
          options: variableOptionsInput
            .split(",")
            .map((option) => option.trim())
            .filter(Boolean),
        },
      ],
    }));
    setIsVariableOpen(false);
  }

  function removeVariable(key: string) {
    updateDraft((agent) => ({
      ...agent,
      variables: (agent.variables ?? []).filter((variable) => variable.key !== key),
    }));
    setVariableToDelete(null);
  }

  function updateTransition(edgeId: string, field: keyof FlowEdge, value: string) {
    updateDraft((agent) => ({
      ...agent,
      flowEdges: agent.flowEdges.map((edge) =>
        edge.id === edgeId ? { ...edge, [field]: value } : edge
      ),
    }));
  }

  function addTransition() {
    if (!draftAgent || !selectedState || selectedState.nodeType === "end_call") {
      return;
    }
    const nextEdge = buildTransitionDraft(selectedState.id, draftAgent.flowNodes, draftAgent.flowEdges);
    if (!nextEdge) {
      return;
    }
    updateDraft((agent) => ({
      ...agent,
      flowEdges: [...agent.flowEdges, nextEdge],
    }));
  }

  function removeTransition(edgeId: string) {
    updateDraft((agent) => ({
      ...agent,
      flowEdges: agent.flowEdges.filter((edge) => edge.id !== edgeId),
    }));
  }

  function discardChanges() {
    if (!activeAgent) {
      return;
    }
    setDraftAgent(cloneAgent(activeAgent));
    setSelectedStateId((current) =>
      activeAgent.flowNodes.some((node) => node.id === current) ? current : activeAgent.flowNodes[0]?.id ?? ""
    );
  }

  async function saveDraft() {
    if (!activeAgent || !draftAgent) {
      return;
    }

    await saveAction.run(() =>
      updateAgent(activeAgent.id, () => ({
        ...cloneAgent(draftAgent),
        lastEdited: "Just now",
      }))
    );
  }

  function continueNavigation(intent: Exclude<LeaveIntent, null>) {
    bypassNavigationGuardRef.current = true;
    setLeaveIntent(null);

    if (intent.type === "route") {
      router.push(intent.href);
      return;
    }

    window.setTimeout(() => {
      window.history.back();
    }, 0);
  }

  async function saveAndLeave() {
    if (!leaveIntent) {
      return;
    }
    await saveDraft();
    continueNavigation(leaveIntent);
  }

  function attemptRoute(href: string) {
    if (isDirty) {
      setLeaveIntent({ type: "route", href });
      return;
    }
    router.push(href);
  }

  useEffect(() => {
    if (!isDirty) {
      historyGuardRef.current = false;
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    if (!historyGuardRef.current) {
      window.history.pushState({ voiceDraftGuard: true }, "", window.location.href);
      historyGuardRef.current = true;
    }

    function handlePopState() {
      if (bypassNavigationGuardRef.current) {
        return;
      }
      window.history.pushState({ voiceDraftGuard: true }, "", window.location.href);
      setLeaveIntent({ type: "back" });
    }

    function handleDocumentClick(event: MouseEvent) {
      if (bypassNavigationGuardRef.current) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }
      if (anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const destination = new URL(anchor.href, window.location.origin);
      const currentLocation = new URL(window.location.href);
      if (destination.origin !== currentLocation.origin) {
        return;
      }
      if (
        destination.pathname === currentLocation.pathname &&
        destination.search === currentLocation.search &&
        destination.hash === currentLocation.hash
      ) {
        return;
      }

      event.preventDefault();
      setLeaveIntent({
        type: "route",
        href: `${destination.pathname}${destination.search}${destination.hash}`,
      });
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isDirty]);

  if (!activeAgent || !draftAgent) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Build"
          title="Agent studio"
          description="Open an agent to configure workflow prompts, runtime, and state transitions."
        />
        <EmptyState
          title={agentId ? "Agent not found" : "No agent selected"}
          description={
            agentId
              ? "This agent could not be loaded from the current workspace."
              : "Select an agent from the list to open its workflow studio."
          }
        />
      </div>
    );
  }

  const renderRuntimeTab = (kind: SupportedProviderKind) => {
    const accountOptions = getAccountOptions(providerAccounts, kind);

    if (!accountOptions.length) {
      return (
        <Card className="border-dashed bg-[#fcfcff]">
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-[#17171F]">
                {kind === "telephony"
                  ? "No telephony connection yet"
                  : `No ${kind.toUpperCase()} connection yet`}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6D6D78]">
                Add the vendor account in Connections first. Once that layer is connected, its runtime options will appear here automatically.
              </p>
            </div>
            <div>
              <Button asChild href="/connections" variant="secondary">
                Go to connections
              </Button>
            </div>
          </div>
        </Card>
      );
    }

    if (kind === "telephony") {
      const selectedAccount = providerAccounts.find(
        (item) => item.id === draftAgent.runtimeProfile.telephony.providerAccountId
      );

      return (
        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#17171F]">Telephony runtime</h2>
              <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                Select the connected telephony account and choose the number used for live browser tests or future telephony launches.
              </p>
            </div>
            <Badge tone={selectedAccount ? "success" : "warning"}>
              {selectedAccount ? getProviderLabel("telephony", selectedAccount.vendorName) : "Connection required"}
            </Badge>
          </div>
          <Select
            label="Connected telephony account"
            options={accountOptions}
            value={draftAgent.runtimeProfile.telephony.providerAccountId}
            onChange={(event) => updateTelephonyAccount(event.target.value)}
          />
          <ConfigFields
            fields={buildRuntimeFields("telephony")}
            values={draftAgent.runtimeProfile.telephony as unknown as Record<string, unknown>}
            onChange={(fieldId, value) =>
              updateRuntimeSection("telephony", (telephony) => ({
                ...telephony,
                [fieldId]: value,
              }))
            }
          />
        </Card>
      );
    }

    const layerProfile = draftAgent.runtimeProfile[kind];
    const selectedAccount = providerAccounts.find((item) => item.id === layerProfile.providerAccountId);
    const defaultLanguage = draftAgent.runtimeProfile.workflow.defaultLanguage;

    return (
      <Card className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#17171F]">{kind.toUpperCase()} runtime</h2>
            <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
              {kind === "stt"
                ? "Choose the speech-to-text account and set transcription-specific controls for this workflow."
                : kind === "llm"
                  ? "Choose the reasoning account and tune model, response, and retry behavior here."
                  : "Choose the text-to-speech account and shape the final voice output here."}
            </p>
          </div>
          <Badge tone={selectedAccount ? "success" : "warning"}>
            {selectedAccount ? getProviderLabel(kind, selectedAccount.vendorName) : "Connection required"}
          </Badge>
        </div>
        <Select
          label="Connected provider"
          options={accountOptions}
          value={layerProfile.providerAccountId}
          onChange={(event) => updateProviderSelection(kind, event.target.value)}
        />
        {kind === "stt" || kind === "tts" ? (
          <div className="rounded-2xl border border-border bg-[#fafafe] px-4 py-3">
            <p className="text-sm font-medium text-[#17171F]">Resolved language code</p>
            <p className="mt-1 text-sm text-[#6D6D78]">
              Workflow language <span className="font-medium text-[#17171F]">
                {
                  getWorkflowLanguageOptions().find((item) => item.value === defaultLanguage)?.label
                }
              </span>{" "}
              maps to <span className="font-medium text-[#17171F]">
                {getResolvedLanguageLabel(kind, layerProfile.vendor, defaultLanguage)}
              </span>{" "}
              for this vendor.
            </p>
          </div>
        ) : null}
        <ConfigFields
          fields={buildRuntimeFields(kind)}
          values={layerProfile as unknown as Record<string, unknown>}
          onChange={(fieldId, value) =>
            updateRuntimeSection(kind, (profile) => ({
              ...profile,
              [fieldId]: value,
            }))
          }
        />
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title={draftAgent.name}
        description="Configure the workflow in steps, keep changes local until save, and define state transitions explicitly before publishing."
        actions={
          <Button variant="secondary" onClick={() => attemptRoute("/agents")}>
            <ArrowLeft size={16} />
            Back to agents
          </Button>
        }
      />

      <Card className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={draftAgent.statusTone}>{draftAgent.status}</Badge>
            {draftAgent.segment ? <Badge tone="neutral">{draftAgent.segment}</Badge> : null}
            <p className="text-sm text-[#6D6D78]">
              {isDirty ? "Unsaved changes" : `Last edited ${draftAgent.lastEdited}`}
            </p>
          </div>
          <p className="text-sm text-[#6D6D78]">Draft changes stay local until you save.</p>
        </div>

        <Tabs
          ariaLabel="Agent studio sections"
          items={editorTabs}
          onChange={(tab) => setSelectedTab(tab as EditorTab)}
          value={selectedTab}
        />
      </Card>

      {selectedTab === "overview" ? (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-[#17171F]">Workflow details</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6D6D78]">
              Set the basics once here. This page edits the current workflow only, so there is no workflow switcher inside the studio.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Workflow name"
              value={draftAgent.name}
              onChange={(event) => updateDraft((agent) => ({ ...agent, name: event.target.value }))}
            />
            <Input
              label="Workflow segment"
              placeholder="Lead qualification"
              value={draftAgent.segment}
              onChange={(event) => updateDraft((agent) => ({ ...agent, segment: event.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Workflow goal"
              placeholder="Qualify and route high-intent callers"
              value={draftAgent.goal}
              onChange={(event) => updateDraft((agent) => ({ ...agent, goal: event.target.value }))}
            />
            <Input label="Pipeline mode" value="STT -> LLM -> TTS" disabled />
          </div>
          <Textarea
            label="Workflow description"
            rows={4}
            value={draftAgent.description}
            onChange={(event) => updateDraft((agent) => ({ ...agent, description: event.target.value }))}
          />
        </Card>
      ) : null}

      {selectedTab === "workflow" ? (
        <Card className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-[#17171F]">Shared workflow behavior</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6D6D78]">
              These prompts apply across the workflow. State-specific prompts are configured later in the States tab.
            </p>
          </div>
          <PromptEditor
            label="System prompt"
            rows={10}
            placeholder="Set the shared behavior, tone, policy, and answer boundaries for the full workflow."
            value={draftAgent.sharedPrompt}
            variables={draftAgent.variables ?? []}
            onChange={(value) => updateDraft((agent) => ({ ...agent, sharedPrompt: value }))}
          />
          <PromptEditor
            label="Opening message"
            rows={4}
            placeholder="Hello, this is Voice. How can I help you today?"
            value={draftAgent.runtimeProfile.prompt.openingMessage}
            variables={draftAgent.variables ?? []}
            onChange={(value) =>
              updateRuntimeSection("prompt", (prompt) => ({
                ...prompt,
                openingMessage: value,
              }))
            }
          />
          <Select
            label="Default call language"
            options={getWorkflowLanguageOptions()}
            value={draftAgent.runtimeProfile.workflow.defaultLanguage}
            onChange={(event) => updateWorkflowLanguage(event.target.value as WorkflowLanguage)}
          />
          <Select
            label="Workflow sample rate"
            options={getWorkflowSampleRateOptions()}
            value={String(draftAgent.runtimeProfile.workflow.sampleRate)}
            onChange={(event) =>
              updateWorkflowSampleRate(Number(event.target.value) as 8000 | 16000 | 24000)
            }
          />
          <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-medium text-[#17171F]">Conversation variables</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6D6D78]">
                  Define values that can be inserted into the shared prompt, opening message, or any state prompt. Values are supplied when a call starts.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={openVariableModal}>
                <Plus size={14} />
                Add variable
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {(draftAgent.variables ?? []).length ? (
                (draftAgent.variables ?? []).map((variable) => (
                  <div key={variable.key} className="flex flex-col gap-2 rounded-xl border border-border bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#17171F]">
                        {variable.label} <span className="font-mono text-xs text-[#6D6D78]">{"{{" + variable.key + "}}"}</span>
                      </p>
                      <p className="mt-1 text-xs text-[#6D6D78]">
                        {variable.dataType}{variable.required ? " · required" : " · optional"}{variable.description ? ` · ${variable.description}` : ""}
                      </p>
                    </div>
                    <Button variant="ghost" onClick={() => setVariableToDelete(variable)}>
                      <Trash2 size={15} />
                      Remove
                    </Button>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-white px-3 py-4 text-sm text-[#6D6D78]">
                  No variables defined yet.
                </p>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {selectedTab === "telephony" ? renderRuntimeTab("telephony") : null}
      {selectedTab === "stt" ? renderRuntimeTab("stt") : null}
      {selectedTab === "llm" ? renderRuntimeTab("llm") : null}
      {selectedTab === "tts" ? renderRuntimeTab("tts") : null}

      {selectedTab === "states" ? (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.95fr)]">
          <Card className="min-w-0 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#17171F]">State map</h2>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                  Add states, define the purpose of each step, and wire exact transition conditions between them. Click any node in the map to edit it on the right.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={autoOrganizeStates}>
                  Auto organize
                </Button>
                <Button size="sm" variant="secondary" onClick={addState}>
                  <Plus size={14} />
                  Add state
                </Button>
              </div>
            </div>

            {draftAgent.flowNodes.length ? (
              <div className="min-w-0 overflow-hidden rounded-[20px] border border-border bg-white">
                <div className="surface-grid max-w-full overflow-x-auto scrollbar-subtle">
                  <AgentFlowCanvas
                    edges={draftAgent.flowEdges}
                    nodes={draftAgent.flowNodes}
                    onMoveNode={(id, position) =>
                      updateDraft((agent) => ({
                        ...agent,
                        flowNodes: agent.flowNodes.map((node) =>
                          node.id === id ? { ...node, ...position } : node
                        ),
                      }))
                    }
                    selectedId={selectedState?.id ?? ""}
                    onSelect={setSelectedStateId}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                title="No states yet"
                description="Start from an empty workflow or add the first state here to define how the conversation should begin."
              />
            )}
          </Card>

          <Card className="min-w-0 space-y-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
            {selectedState ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#6D6D78]">Selected state</p>
                    <h2 className="mt-2 text-lg font-semibold text-[#17171F]">{selectedState.label}</h2>
                  </div>
                  <Button
                    disabled={selectedState.nodeType === "end_call"}
                    variant="ghost"
                    onClick={() => setStateToDelete({ id: selectedState.id, label: selectedState.label })}
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </div>

                <Input
                  disabled={selectedState.nodeType === "end_call"}
                  label="State name"
                  value={selectedState.label}
                  onChange={(event) => updateSelectedState("label", event.target.value)}
                />
                <Input
                  disabled={selectedState.nodeType === "end_call"}
                  label="State objective"
                  value={selectedState.state}
                  onChange={(event) => updateSelectedState("state", event.target.value)}
                />
                {selectedState.nodeType === "end_call" ? (
                  <div className="space-y-2">
                    <span className="block text-sm font-medium text-[#17171F]">Closing behavior</span>
                    <div className="rounded-2xl border border-[rgba(217,119,6,0.18)] bg-[rgba(217,119,6,0.06)] px-4 py-4">
                      <p className="text-sm font-medium text-[#8A5700]">Generated closing response</p>
                      <p className="mt-1 text-sm leading-6 text-[#8A5700]">
                        End call is a fixed terminal node. The runtime generates a concise closing note from the conversation, plays it once, and ends the call without waiting for another reply.
                      </p>
                    </div>
                  </div>
                ) : (
                  <PromptEditor
                    label="State prompt"
                    rows={8}
                    value={selectedState.prompt}
                    variables={draftAgent.variables ?? []}
                    onChange={(value) => updateSelectedState("prompt", value)}
                  />
                )}

                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#17171F]">Transitions</p>
                      <p className="mt-1 text-sm leading-6 text-[#6D6D78]">
                        Define when this state hands control to the next one.
                      </p>
                    </div>
                    <Button
                      disabled={
                        selectedState.nodeType === "end_call" ||
                        !buildTransitionDraft(selectedState.id, draftAgent.flowNodes, draftAgent.flowEdges)
                      }
                      size="sm"
                      variant="secondary"
                      onClick={addTransition}
                    >
                      <Plus size={14} />
                      Add transition
                    </Button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {outgoingTransitions.length ? (
                      outgoingTransitions.map((edge) => (
                        <div key={edge.id} className="rounded-2xl border border-border bg-white p-4">
                          <div className="space-y-3">
                            <Select
                              label="Next state"
                              value={edge.targetId}
                              options={draftAgent.flowNodes
                                .filter((node) => node.id !== selectedState.id)
                                .map((node) => ({ label: node.label, value: node.id }))}
                              onChange={(event) => updateTransition(edge.id, "targetId", event.target.value)}
                            />
                            <Input
                              label="Transition label"
                              value={edge.label}
                              onChange={(event) => updateTransition(edge.id, "label", event.target.value)}
                            />
                            <Textarea
                              label="Transition condition"
                              rows={3}
                              placeholder="Move to booking after the caller confirms interest and agrees to schedule."
                              value={edge.condition}
                              onChange={(event) => updateTransition(edge.id, "condition", event.target.value)}
                            />
                            <div className="flex justify-end">
                              <Button variant="ghost" onClick={() => setTransitionToDelete(edge)}>
                                <Trash2 size={16} />
                                Delete transition
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        title="No transitions yet"
                        description="Add a transition to show where this state should go next and what condition triggers the move."
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title="No state selected"
                description="Choose a state from the map or create a new one to start defining prompts and transitions."
              />
            )}
          </Card>
        </div>
      ) : null}

      <Card className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#17171F]">Save changes</h2>
            <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
              Nothing is written until you save. You can move across tabs freely and review everything before committing the draft.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!isDirty || saveAction.isPending} variant="secondary" onClick={discardChanges}>
              Discard changes
            </Button>
            <Button loading={saveAction.isPending} loadingText="Saving changes" onClick={() => void saveDraft()}>
              <Save size={16} />
              Save changes
            </Button>
            <Button
              disabled={isDirty}
              loading={publishAction.isPending}
              loadingText="Publishing workflow"
              onClick={() => void publishAction.run(() => publishAgent(activeAgent.id))}
            >
              Publish workflow
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmActionModal
        title="Remove variable"
        description={
          variableToDelete
            ? `Remove ${variableToDelete.label}? Existing prompt tokens will remain unresolved until you remove or replace them.`
            : "Remove this variable?"
        }
        confirmLabel="Remove variable"
        isOpen={Boolean(variableToDelete)}
        isPending={deleteAction.pendingKey === `variable:${variableToDelete?.key ?? ""}`}
        onClose={() => setVariableToDelete(null)}
        onConfirm={() => {
          if (!variableToDelete) {
            return;
          }
          void deleteAction.run(`variable:${variableToDelete.key}`, async () => {
            removeVariable(variableToDelete.key);
          });
        }}
      />

      <Modal
        title="Add conversation variable"
        description="Define a typed value that can be supplied before a live call or per evaluation case."
        isOpen={isVariableOpen}
        onClose={() => setIsVariableOpen(false)}
      >
        <div className="space-y-4">
          <Input
            label="Variable key"
            placeholder="farmer_name"
            value={variableDraft.key}
            onChange={(event) => setVariableDraft((current) => ({ ...current, key: event.target.value }))}
          />
          <Input
            label="Display label"
            placeholder="Farmer name"
            value={variableDraft.label}
            onChange={(event) => setVariableDraft((current) => ({ ...current, label: event.target.value }))}
          />
          <Select
            label="Data type"
            options={[
              { label: "Text", value: "text" },
              { label: "Number", value: "number" },
              { label: "Boolean", value: "boolean" },
              { label: "Date", value: "date" },
              { label: "Date and time", value: "datetime" },
              { label: "Enum", value: "enum" },
            ]}
            value={variableDraft.dataType}
            onChange={(event) =>
              setVariableDraft((current) => ({
                ...current,
                dataType: event.target.value as VariableDataType,
              }))
            }
          />
          <Input
            label="Description"
            placeholder="Used to address the caller naturally"
            value={variableDraft.description}
            onChange={(event) => setVariableDraft((current) => ({ ...current, description: event.target.value }))}
          />
          {variableDraft.dataType === "enum" ? (
            <Input
              label="Allowed options"
              placeholder="new, returning, unknown"
              value={variableOptionsInput}
              onChange={(event) => setVariableOptionsInput(event.target.value)}
            />
          ) : null}
          <label className="flex items-center gap-3 text-sm text-[#17171F]">
            <input
              checked={variableDraft.required}
              onChange={(event) => setVariableDraft((current) => ({ ...current, required: event.target.checked }))}
              type="checkbox"
            />
            Required before a call can start
          </label>
          {variableError ? <p className="text-sm text-[#DC2626]">{variableError}</p> : null}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsVariableOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addVariable}>Add variable</Button>
          </div>
        </div>
      </Modal>

      <ConfirmActionModal
        title="Delete transition"
        description={
          transitionToDelete
            ? `Delete the transition to ${findStateLabel(draftAgent, transitionToDelete.targetId)}?`
            : "Delete this transition?"
        }
        confirmLabel="Delete transition"
        isOpen={Boolean(transitionToDelete)}
        isPending={deleteAction.pendingKey === `transition:${transitionToDelete?.id ?? ""}`}
        onClose={() => setTransitionToDelete(null)}
        onConfirm={() => {
          if (!transitionToDelete) {
            return;
          }
          void deleteAction.run(`transition:${transitionToDelete.id}`, async () => {
            removeTransition(transitionToDelete.id);
            setTransitionToDelete(null);
          });
        }}
      />

      <ConfirmActionModal
        title="Delete state"
        description={
          stateToDelete
            ? `Delete ${stateToDelete.label}? All incoming and outgoing transitions for this state will also be removed.`
            : "Delete this state?"
        }
        confirmLabel="Delete state"
        isOpen={Boolean(stateToDelete)}
        isPending={deleteAction.pendingKey === `state:${stateToDelete?.id ?? ""}`}
        onClose={() => setStateToDelete(null)}
        onConfirm={() => {
          if (!stateToDelete) {
            return;
          }
          void deleteAction.run(`state:${stateToDelete.id}`, async () => {
            removeState(stateToDelete.id);
            setStateToDelete(null);
          });
        }}
      />

      <Modal
        title="Unsaved changes"
        description="You have unsaved workflow changes. Save them before leaving this page, or discard them and continue."
        isOpen={Boolean(leaveIntent)}
        onClose={() => setLeaveIntent(null)}
      >
        <div className="flex flex-wrap justify-end gap-3">
          <Button disabled={saveAction.isPending} variant="secondary" onClick={() => setLeaveIntent(null)}>
            Stay here
          </Button>
          <Button
            disabled={saveAction.isPending}
            variant="secondary"
            onClick={() => {
              if (!leaveIntent) {
                return;
              }
              discardChanges();
              continueNavigation(leaveIntent);
            }}
          >
            Discard changes
          </Button>
          <Button
            loading={saveAction.isPending}
            loadingText="Saving changes"
            onClick={() => void saveAndLeave()}
          >
            Save changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
