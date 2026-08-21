"use client";

import { shieldPolicies } from "@/lib/mock-data";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function GuardrailsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Guardrails"
        description="Configure pre-LLM, pre-TTS, and behavioral guardrails, then review the violations that inform QA and eval suites."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {shieldPolicies.map((policy) => (
          <Card key={policy.stage} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{policy.stage}</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">{policy.description}</p>
              </div>
              <Badge tone={policy.tone}>{policy.status}</Badge>
            </div>
            <div className="space-y-3">
              {policy.rules.map((rule) => (
                <div key={rule.name} className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{rule.name}</p>
                    <span className="text-xs text-[#6D6D78]">{rule.lastTriggered}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{rule.copy}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
