"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function GuardrailsPage() {
  const { callHistory, agents } = useMockApp();
  const entries = [...new Set(callHistory.flatMap((call) => call.guardrails))];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Guardrails"
        description="Review the guardrails already exercised in the current product story and which workflows rely on them."
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active rules</h2>
            <Badge tone="success">{entries.length} observed</Badge>
          </div>
          <div className="mt-5 space-y-3">
            {entries.map((entry) => (
              <div key={entry} className="rounded-2xl border border-border bg-white p-4">
                <p className="font-medium">{entry}</p>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                  Confirmed through reviewed calls in the current prototype flow.
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Workflow coverage</h2>
            <Badge tone="neutral">{agents.length} workflows</Badge>
          </div>
          <div className="mt-5 space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{agent.name}</p>
                  <Badge tone={agent.statusTone}>{agent.status}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{agent.goal}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
