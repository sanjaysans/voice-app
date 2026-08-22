"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function PromptsPage() {
  const { agents } = useMockApp();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Prompts"
        description="Review the live prompt surface across routing, qualification, conversion, and escalation nodes."
      />

      <div className="space-y-4">
        {agents.map((agent) => (
          <Card key={agent.id}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{agent.name}</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">{agent.description}</p>
              </div>
              <Badge tone={agent.statusTone}>{agent.status}</Badge>
            </div>
            <div className="mt-5 grid gap-3 xl:grid-cols-2">
              {agent.flowNodes.map((node) => (
                <div key={node.id} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{node.label}</p>
                    <Badge tone={node.tone}>{node.state}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#4B4B59]">{node.prompt}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
