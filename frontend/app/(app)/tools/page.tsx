"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function ToolsPage() {
  const { agents } = useMockApp();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Tools"
        description="Review shared tool access across workflows and keep the first product version focused on the tools that change call outcomes."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.id}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{agent.name}</h2>
              <Badge tone={agent.statusTone}>{agent.status}</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {agent.toolsCatalog.map((tool) => (
                <div key={tool.id} className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{tool.name}</p>
                    <Badge tone={tool.enabled ? "success" : "warning"}>
                      {tool.enabled ? "Enabled" : "Optional"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{tool.description}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
