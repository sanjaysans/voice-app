"use client";

import { useState } from "react";
import { Play, Save, Sparkles } from "lucide-react";
import { AgentFlowCanvas } from "@/components/agent-flow-canvas";
import { builderNodes as initialNodes } from "@/lib/mock-data";
import { Badge, Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui";

export default function AgentBuilderPage() {
  const [nodes, setNodes] = useState(initialNodes);
  const [selectedId, setSelectedId] = useState(initialNodes[0].id);
  const selectedNode = nodes.find((node) => node.id === selectedId) ?? nodes[0];

  const updateSelected = (field: string, value: string) => {
    setNodes((current) =>
      current.map((node) => (node.id === selectedNode.id ? { ...node, [field]: value } : node))
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Agent builder"
        description="Design the orchestration graph from router agent to specialized handoff paths."
        actions={
          <>
            <Button variant="secondary">
              <Play size={16} />
              Run simulation
            </Button>
            <Button>
              <Save size={16} />
              Publish flow
            </Button>
          </>
        }
      />

      <div className="grid gap-6 2xl:grid-cols-[1.6fr_0.9fr]">
        <Card className="min-h-[760px] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Routing canvas</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Select a node to edit prompts, tools, knowledge bindings, and vendors.</p>
            </div>
            <Badge tone="success">Draft autosaved</Badge>
          </div>
          <div className="surface-grid h-[690px] bg-white">
            <AgentFlowCanvas nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[#6D6D78]">Selected node</p>
              <h2 className="mt-2 text-lg font-semibold">{selectedNode.label}</h2>
            </div>
            <Badge tone={selectedNode.tone}>{selectedNode.state}</Badge>
          </div>

          <Input
            label="Node name"
            value={selectedNode.label}
            onChange={(event) => updateSelected("label", event.target.value)}
          />

          <Textarea
            label="System prompt"
            rows={6}
            value={selectedNode.prompt}
            onChange={(event) => updateSelected("prompt", event.target.value)}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-[#17171F]">Tools</p>
            <div className="flex flex-wrap gap-2">
              {selectedNode.tools.map((tool) => (
                <Badge key={tool} tone="neutral">
                  {tool}
                </Badge>
              ))}
            </div>
            <p className="text-xs leading-5 text-[#6D6D78]">Tool management is mocked for this phase but represented in the editable configuration rail.</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[#17171F]">Knowledge bindings</p>
            <div className="flex flex-wrap gap-2">
              {selectedNode.kb.map((binding) => (
                <Badge key={binding} tone="neutral">
                  {binding}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="STT vendor"
              value={selectedNode.vendors.stt}
              options={["Deepgram", "AssemblyAI", "Google STT"]}
              onChange={(event) =>
                setNodes((current) =>
                  current.map((node) =>
                    node.id === selectedNode.id
                      ? { ...node, vendors: { ...node.vendors, stt: event.target.value } }
                      : node
                  )
                )
              }
            />
            <Select
              label="LLM vendor"
              value={selectedNode.vendors.llm}
              options={["GPT-4.1", "Claude Sonnet", "Gemini"]}
              onChange={(event) =>
                setNodes((current) =>
                  current.map((node) =>
                    node.id === selectedNode.id
                      ? { ...node, vendors: { ...node.vendors, llm: event.target.value } }
                      : node
                  )
                )
              }
            />
            <Select
              label="TTS vendor"
              value={selectedNode.vendors.tts}
              options={["ElevenLabs", "Cartesia", "Azure TTS"]}
              onChange={(event) =>
                setNodes((current) =>
                  current.map((node) =>
                    node.id === selectedNode.id
                      ? { ...node, vendors: { ...node.vendors, tts: event.target.value } }
                      : node
                  )
                )
              }
            />
          </div>

          <div className="rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-accent">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="font-medium">Builder guidance</p>
                <p className="mt-2 text-sm leading-6 text-[#5D52D6]">
                  Router nodes should stay lightweight. Put long-form reasoning and vendor-heavy tool orchestration in specialized nodes.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
