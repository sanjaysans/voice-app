"use client";

import { useEffect, useState } from "react";
import { Play, Save } from "lucide-react";
import { AgentFlowCanvas } from "@/components/agent-flow-canvas";
import { ConfigFields } from "@/components/config-fields";
import { useMockApp } from "@/lib/mock-app";
import { useAsyncAction } from "@/lib/use-async-action";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import {
  getAccountOptions,
  getAccountsByKind,
  getProviderDefinition,
  getProviderLabel,
  parsePhoneNumbers,
  type AgentRuntimeProfile,
  type SupportedProviderKind,
} from "@/lib/voice-stack";

const editorTabs = ["Prompt", "Tools", "Knowledge", "Runtime"];

export default function AgentBuilderPage() {
  const {
    agents,
    selectedAgent,
    selectAgent,
    updateAgent,
    updateFlowNode,
    toggleTool,
    toggleKnowledge,
    publishAgent,
    providerAccounts
  } = useMockApp();
  const [selectedNodeId, setSelectedNodeId] = useState(selectedAgent?.flowNodes[0]?.id ?? "");
  const [selectedTab, setSelectedTab] = useState("Prompt");
  const publishAction = useAsyncAction();
  const selectedNode =
    selectedAgent?.flowNodes.find((node) => node.id === selectedNodeId) ??
    selectedAgent?.flowNodes[0];

  function updateRuntimeProfile(updater: (profile: AgentRuntimeProfile) => AgentRuntimeProfile) {
    if (!selectedAgent) {
      return;
    }

    void updateAgent(selectedAgent.id, (agent) => {
      const nextProfile = updater(agent.runtimeProfile);
      const sttAccount = providerAccounts.find(
        (account) => account.id === nextProfile.stt.providerAccountId
      );
      const llmAccount = providerAccounts.find(
        (account) => account.id === nextProfile.llm.providerAccountId
      );
      const ttsAccount = providerAccounts.find(
        (account) => account.id === nextProfile.tts.providerAccountId
      );

      return {
        ...agent,
        lastEdited: "Just now",
        runtimeProfile: nextProfile,
        stack: {
          stt: sttAccount ? getProviderLabel("stt", sttAccount.vendorName) : agent.stack.stt,
          llm: llmAccount ? getProviderLabel("llm", llmAccount.vendorName) : agent.stack.llm,
          tts: ttsAccount ? getProviderLabel("tts", ttsAccount.vendorName) : agent.stack.tts
        }
      };
    });
  }

  function buildRuntimeFields(kind: SupportedProviderKind) {
    const runtimeProfile = selectedAgent?.runtimeProfile;
    if (!runtimeProfile) {
      return [];
    }

    if (kind === "telephony") {
      const account = providerAccounts.find(
        (item) => item.id === runtimeProfile.telephony.providerAccountId
      );
      const definition = getProviderDefinition("telephony", account?.vendorName || "twilio");
      const options = parsePhoneNumbers(account?.preview.phone_numbers).map((item) => ({
        label: item,
        value: item
      }));
      return (definition?.runtimeFields ?? []).map((field) =>
        field.id === "phoneNumber" ? { ...field, options } : field
      );
    }

    const account = providerAccounts.find((item) => {
      if (kind === "stt") {
        return item.id === runtimeProfile.stt.providerAccountId;
      }
      if (kind === "llm") {
        return item.id === runtimeProfile.llm.providerAccountId;
      }
      return item.id === runtimeProfile.tts.providerAccountId;
    });
    return getProviderDefinition(kind, account?.vendorName || (kind === "stt" ? "deepgram" : kind === "llm" ? "openai" : "cartesia"))?.runtimeFields ?? [];
  }

  useEffect(() => {
    if (!selectedAgent) {
      setSelectedNodeId("");
      return;
    }
    setSelectedNodeId((current) =>
      selectedAgent.flowNodes.some((node) => node.id === current)
        ? current
        : selectedAgent.flowNodes[0]?.id ?? ""
    );
  }, [selectedAgent]);

  if (!selectedAgent || !selectedNode) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Build"
          title="Agent studio"
          description="One place to shape routing, prompts, knowledge, tools, and vendor choices before a workflow goes live."
        />
        <EmptyState
          title="This workflow needs starter nodes"
          description="Select another workflow or create a fresh one so the studio can render a routing path."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Agent studio"
        description="One place to shape routing, prompts, knowledge, tools, and vendor choices before a workflow goes live."
        actions={
          <>
            <Button asChild href="/calls" variant="secondary">
              <Play size={16} />
              Run call
            </Button>
            <Button
              loading={publishAction.isPending}
              loadingText="Publishing workflow"
              onClick={() => void publishAction.run(() => publishAgent(selectedAgent.id))}
            >
              <Save size={16} />
              Publish workflow
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Selected workflow"
                  value={selectedAgent.id}
                  options={agents.map((agent) => ({ label: agent.name, value: agent.id }))}
                  onChange={(event) => {
                    selectAgent(event.target.value);
                    const nextAgent = agents.find((agent) => agent.id === event.target.value);
                    if (nextAgent) {
                      setSelectedNodeId(nextAgent.flowNodes[0]?.id ?? "");
                    }
                  }}
                />
                <Input
                  label="Workflow name"
                  value={selectedAgent.name}
                  onChange={(event) =>
                    updateAgent(selectedAgent.id, (agent) => ({
                      ...agent,
                      name: event.target.value,
                      lastEdited: "Just now"
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge tone={selectedAgent.statusTone}>{selectedAgent.status}</Badge>
                <Badge tone="neutral">{selectedAgent.segment}</Badge>
                <p className="text-sm text-[#6D6D78]">Last edited {selectedAgent.lastEdited}</p>
              </div>
            </div>

            <Textarea
              label="Workflow purpose"
              rows={3}
              value={selectedAgent.description}
              onChange={(event) =>
                updateAgent(selectedAgent.id, (agent) => ({
                  ...agent,
                  description: event.target.value,
                  lastEdited: "Just now"
                }))
              }
            />
          </Card>

          <Card className="min-h-[760px] overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Routing canvas</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Select a node to tune prompts and voice settings. Tools and knowledge stay shared across the full workflow.</p>
              </div>
              <Badge tone="success">Interactive</Badge>
            </div>
            <div className="surface-grid h-[690px] bg-white">
              <AgentFlowCanvas
                edges={selectedAgent.flowEdges}
                nodes={selectedAgent.flowNodes}
                selectedId={selectedNodeId}
                onSelect={setSelectedNodeId}
              />
            </div>
          </Card>
        </div>

        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#6D6D78]">Selected node</p>
              <h2 className="mt-2 text-lg font-semibold">{selectedNode.label}</h2>
            </div>
            <Badge tone={selectedNode.tone}>{selectedNode.state}</Badge>
          </div>

          <div className="flex rounded-xl border border-border bg-[#fafafe] p-1">
            {editorTabs.map((tab) => (
              <button
                key={tab}
                className={`flex-1 rounded-lg px-3 py-2 text-sm transition ${
                  selectedTab === tab ? "bg-white text-accent shadow-sm" : "text-[#6D6D78]"
                }`}
                onClick={() => setSelectedTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          {selectedTab === "Prompt" ? (
            <div className="space-y-4">
              <Input
                label="Node name"
                value={selectedNode.label}
                onChange={(event) => updateFlowNode(selectedAgent.id, selectedNode.id, "label", event.target.value)}
              />
              <Input
                label="Node objective"
                value={selectedNode.state}
                onChange={(event) => updateFlowNode(selectedAgent.id, selectedNode.id, "state", event.target.value)}
              />
              <Textarea
                label="System prompt"
                rows={10}
                value={selectedNode.prompt}
                onChange={(event) => updateFlowNode(selectedAgent.id, selectedNode.id, "prompt", event.target.value)}
              />
            </div>
          ) : null}

          {selectedTab === "Tools" ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4 text-sm leading-6 text-[#6D6D78]">
                These tools apply across the current workflow and are available to the active routing path when needed.
              </div>
              {selectedAgent.toolsCatalog.map((tool) => (
                <button
                  key={tool.id}
                  className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:border-[rgba(102,89,255,0.22)]"
                  onClick={() => toggleTool(selectedAgent.id, tool.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{tool.name}</p>
                      <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{tool.description}</p>
                    </div>
                    <Badge tone={tool.enabled ? "success" : "warning"}>{tool.enabled ? "Enabled" : "Optional"}</Badge>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {selectedTab === "Knowledge" ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4 text-sm leading-6 text-[#6D6D78]">
                Knowledge sources are bound at the workflow level so every node can stay grounded in the same operating context.
              </div>
              {selectedAgent.knowledgeSources.map((source) => (
                <button
                  key={source.id}
                  className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:border-[rgba(102,89,255,0.22)]"
                  onClick={() => toggleKnowledge(selectedAgent.id, source.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{source.name}</p>
                      <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{source.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={source.status === "Connected" ? "success" : "warning"}>{source.status}</Badge>
                      <Badge tone={source.enabled ? "success" : "neutral"}>{source.enabled ? "Bound" : "Muted"}</Badge>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {selectedTab === "Runtime" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4 text-sm leading-6 text-[#6D6D78]">
                The runtime stays generic at the agent layer. Users only select from providers already configured in Connections, and the layer-specific fields adapt to the chosen vendor.
              </div>

              <div className="rounded-2xl border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#17171F]">Telephony</p>
                    <p className="mt-1 text-sm text-[#6D6D78]">Pick the connected line used as caller identity for launches.</p>
                  </div>
                  <Badge tone="neutral">Optional for browser live</Badge>
                </div>
                <div className="mt-4 space-y-4">
                  <Select
                    label="Connected telephony account"
                    options={getAccountOptions(providerAccounts, "telephony")}
                    value={selectedAgent.runtimeProfile.telephony.providerAccountId}
                    onChange={(event) =>
                      updateRuntimeProfile((profile) => ({
                        ...profile,
                        telephony: {
                          ...profile.telephony,
                          providerAccountId: event.target.value,
                          phoneNumber: ""
                        }
                      }))
                    }
                  />
                  <ConfigFields
                    fields={buildRuntimeFields("telephony")}
                    values={selectedAgent.runtimeProfile.telephony as unknown as Record<string, unknown>}
                    onChange={(fieldId, value) =>
                      updateRuntimeProfile((profile) => ({
                        ...profile,
                        telephony: { ...profile.telephony, [fieldId]: value }
                      }))
                    }
                  />
                </div>
              </div>

              {(["stt", "llm", "tts"] as const).map((kind) => {
                const layerProfile = selectedAgent.runtimeProfile[kind];
                const accounts = getAccountsByKind(providerAccounts, kind);
                const selectedAccount = accounts.find(
                  (account) => account.id === layerProfile.providerAccountId
                );

                return (
                  <div key={kind} className="rounded-2xl border border-border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
                          {kind}
                        </p>
                        <p className="mt-1 text-sm text-[#6D6D78]">
                          {kind === "stt"
                            ? "Capture speech cleanly before the agent reasons."
                            : kind === "llm"
                              ? "Control reasoning behavior, model selection, and retry posture."
                              : "Shape the final voice, pacing, and output style."}
                        </p>
                      </div>
                      <Badge tone={selectedAccount ? "success" : "warning"}>
                        {selectedAccount ? getProviderLabel(kind, selectedAccount.vendorName) : "Connection required"}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-4">
                      <Select
                        label="Connected provider"
                        options={getAccountOptions(providerAccounts, kind)}
                        value={layerProfile.providerAccountId}
                        onChange={(event) => {
                          const account = providerAccounts.find(
                            (item) => item.id === event.target.value
                          );
                          updateRuntimeProfile((profile) => ({
                            ...profile,
                            [kind]: {
                              ...profile[kind],
                              providerAccountId: event.target.value,
                              vendor: account?.vendorName ?? profile[kind].vendor
                            }
                          }));
                        }}
                      />
                      <ConfigFields
                        fields={buildRuntimeFields(kind)}
                        values={layerProfile as unknown as Record<string, unknown>}
                        onChange={(fieldId, value) =>
                          updateRuntimeProfile((profile) => ({
                            ...profile,
                            [kind]: { ...profile[kind], [fieldId]: value }
                          }))
                        }
                      />
                    </div>
                  </div>
                );
              })}

              <div className="rounded-2xl border border-border bg-white p-4">
                <Textarea
                  label="Opening message"
                  rows={3}
                  value={selectedAgent.runtimeProfile.prompt.openingMessage}
                  onChange={(event) =>
                    updateRuntimeProfile((profile) => ({
                      ...profile,
                      prompt: { ...profile.prompt, openingMessage: event.target.value }
                    }))
                  }
                />
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4">
            <p className="font-medium">Workflow posture</p>
            <p className="mt-2 text-sm leading-6 text-[#5D52D6]">
              The current configuration supports routing, qualification, scheduling, service, and escalation patterns while staying reusable across future call programs.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
