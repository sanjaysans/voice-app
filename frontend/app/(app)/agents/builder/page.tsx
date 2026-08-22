"use client";

import { useEffect, useState } from "react";
import { Play, Save } from "lucide-react";
import { AgentFlowCanvas } from "@/components/agent-flow-canvas";
import { useMockApp } from "@/lib/mock-app";
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

const editorTabs = ["Prompt", "Tools", "Knowledge", "Vendors"];

export default function AgentBuilderPage() {
  const {
    agents,
    selectedAgent,
    selectAgent,
    updateAgent,
    updateFlowNode,
    updateNodeVendor,
    toggleTool,
    toggleKnowledge,
    publishAgent
  } = useMockApp();
  const [selectedNodeId, setSelectedNodeId] = useState(selectedAgent.flowNodes[0]?.id ?? "");
  const [selectedTab, setSelectedTab] = useState("Prompt");
  const selectedNode =
    selectedAgent.flowNodes.find((node) => node.id === selectedNodeId) ??
    selectedAgent.flowNodes[0];

  useEffect(() => {
    setSelectedNodeId((current) =>
      selectedAgent.flowNodes.some((node) => node.id === current)
        ? current
        : selectedAgent.flowNodes[0]?.id ?? ""
    );
  }, [selectedAgent]);

  if (!selectedNode) {
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
            <Button onClick={() => publishAgent(selectedAgent.id)}>
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

          {selectedTab === "Vendors" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="STT"
                value={selectedNode.vendors.stt}
                options={["Deepgram", "AssemblyAI", "Google STT"]}
                onChange={(event) => updateNodeVendor(selectedAgent.id, selectedNode.id, "stt", event.target.value)}
              />
              <Select
                label="LLM"
                value={selectedNode.vendors.llm}
                options={["GPT-4.1", "Claude Sonnet", "Gemini"]}
                onChange={(event) => updateNodeVendor(selectedAgent.id, selectedNode.id, "llm", event.target.value)}
              />
              <Select
                label="TTS"
                value={selectedNode.vendors.tts}
                options={["ElevenLabs", "Cartesia", "Azure TTS"]}
                onChange={(event) => updateNodeVendor(selectedAgent.id, selectedNode.id, "tts", event.target.value)}
              />
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
