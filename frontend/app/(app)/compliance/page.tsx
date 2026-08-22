"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function CompliancePage() {
  const { connections, callHistory } = useMockApp();
  const warningConnections = connections.filter((item) => item.status !== "Connected").length;
  const totalGuardrails = callHistory.flatMap((call) => call.guardrails);
  const uniqueGuardrails = [...new Set(totalGuardrails)];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Compliance"
        description="Keep consent, retry posture, guardrail coverage, and operational exceptions visible in one place for the first working product."
      />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Readiness</h2>
            <Badge tone={warningConnections ? "warning" : "success"}>
              {warningConnections ? "Needs review" : "Healthy"}
            </Badge>
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-border bg-[#fafafe] p-4 text-sm leading-6 text-[#4B4B59]">
              {warningConnections
                ? `${warningConnections} integrations still need attention before expanding live traffic.`
                : "All currently visible integrations are in a healthy state."}
            </div>
            <div className="rounded-2xl border border-border bg-[#fafafe] p-4 text-sm leading-6 text-[#4B4B59]">
              {uniqueGuardrails.length} distinct guardrail checks have already appeared in reviewed calls.
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Observed guardrails</h2>
            <Badge tone="neutral">{uniqueGuardrails.length} active</Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {uniqueGuardrails.map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-white p-4">
                <p className="font-medium">{item}</p>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                  Visible in call reviews and ready to be hardened later with policy-level controls.
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
