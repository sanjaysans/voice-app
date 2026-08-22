"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function KnowledgeBasePage() {
  const { agents } = useMockApp();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Knowledge base"
        description="Every reusable knowledge source currently bound across the active workflows."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.id}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{agent.name}</h2>
              <Badge tone={agent.statusTone}>{agent.status}</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {agent.knowledgeSources.map((source) => (
                <div key={source.id} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{source.name}</p>
                    <div className="flex gap-2">
                      <Badge tone={source.status === "Connected" ? "success" : "warning"}>
                        {source.status}
                      </Badge>
                      <Badge tone={source.enabled ? "success" : "neutral"}>
                        {source.enabled ? "Bound" : "Muted"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{source.description}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
