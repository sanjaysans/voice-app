"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

function scoreCall(hasSync: boolean, guardrails: number, toolCalls: number) {
  return Math.min(98, 68 + (hasSync ? 12 : 0) + guardrails * 4 + toolCalls * 3);
}

export default function QaReviewPage() {
  const { callHistory } = useMockApp();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="QA review"
        description="A lightweight quality pass over outcome capture, tool usage, guardrail coverage, and CRM writeback."
      />

      <Card>
        <div className="space-y-3">
          {callHistory.map((call) => {
            const score = scoreCall(
              call.syncedToCrm,
              call.guardrails.length,
              call.toolCalls.length
            );
            return (
              <div key={call.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {call.leadName} · {call.company}
                    </p>
                    <p className="mt-1 text-sm text-[#6D6D78]">{call.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={score >= 85 ? "success" : "warning"}>QA {score}</Badge>
                    <Badge tone={call.syncedToCrm ? "success" : "warning"}>
                      {call.syncedToCrm ? "Synced" : "Needs sync"}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
