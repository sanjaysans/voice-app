"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function CallLogsPage() {
  const { callHistory } = useMockApp();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Call logs"
        description="A dedicated review feed for completed, follow-up, and dropped calls with transcripts, next steps, and sync state."
      />

      <Card>
        <div className="space-y-3">
          {callHistory.map((call) => (
            <div key={call.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {call.leadName} · {call.company}
                  </p>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    {call.agentName} · {call.time} · {call.duration}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={call.statusTone}>{call.status}</Badge>
                  <Badge tone={call.syncedToCrm ? "success" : "warning"}>
                    {call.syncedToCrm ? "CRM synced" : "Pending sync"}
                  </Badge>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#4B4B59]">{call.summary}</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Outcome</p>
                  <p className="mt-2 text-sm font-medium">{call.outcome}</p>
                </div>
                <div className="rounded-xl border border-border bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Vendor trace</p>
                  <p className="mt-2 text-sm font-medium">{call.vendorTrace}</p>
                </div>
                <div className="rounded-xl border border-border bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Next step</p>
                  <p className="mt-2 text-sm font-medium">{call.nextStep}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
