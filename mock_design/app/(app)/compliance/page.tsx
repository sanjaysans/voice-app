"use client";

import { compliancePolicies } from "@/lib/mock-data";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function CompliancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Compliance"
        description="Model consent handling, retention, residency, and outbound policy settings before backend enforcement exists."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {compliancePolicies.map((policy) => (
          <Card key={policy.title}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{policy.title}</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">{policy.copy}</p>
              </div>
              <Badge tone={policy.tone}>{policy.status}</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {policy.items.map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-[#fafafe] px-4 py-3 text-sm text-[#4B4B59]">
                  {item}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
