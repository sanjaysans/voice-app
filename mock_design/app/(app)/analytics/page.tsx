"use client";

import { BarChart3, CalendarCheck2, Gauge, Smile } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { rangeMultipliers } from "@/lib/mock-data";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";

export default function AnalyticsPage() {
  const { callHistory, agents, dateRange } = useMockApp();
  const rangeMultiplier = rangeMultipliers[dateRange as keyof typeof rangeMultipliers] ?? 1;

  const bookedBase = callHistory.filter((call) => call.outcome === "Meeting booked").length;
  const followUpsBase = callHistory.filter((call) => call.outcome === "Follow-up").length;
  const voicemailsBase = callHistory.filter((call) => call.outcome === "Voicemail").length;
  const syncedBase = callHistory.filter((call) => call.syncedToCrm).length;
  const totalCalls = callHistory.length * rangeMultiplier;
  const booked = bookedBase * rangeMultiplier;
  const followUps = followUpsBase * rangeMultiplier;
  const voicemails = voicemailsBase * rangeMultiplier;
  const synced = syncedBase * rangeMultiplier;
  const bookingRate = totalCalls ? Math.round((booked / totalCalls) * 100) : 0;
  const syncRate = totalCalls ? Math.round((synced / totalCalls) * 100) : 0;

  const metrics = [
    {
      label: "Qualified to meeting",
      value: `${bookingRate}%`,
      change: `${booked} booked from ${totalCalls} calls`,
      trend: "up" as const,
      icon: CalendarCheck2
    },
    {
      label: "CRM completion",
      value: `${syncRate}%`,
      change: `${synced} calls synced`,
      trend: "up" as const,
      icon: Gauge
    },
    {
      label: "Follow-up pressure",
      value: String(followUps),
      change: "Human assist remains visible in the story",
      trend: "up" as const,
      icon: BarChart3
    },
    {
      label: "Reach quality",
      value: `${totalCalls - voicemails}/${totalCalls}`,
      change: `${voicemails} voicemail outcomes`,
      trend: "up" as const,
      icon: Smile
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Analytics"
        description="Track qualification, conversion, sync quality, and workflow performance across recent call activity."
      />

      <section className="grid gap-4 xl:grid-cols-4">
        {metrics.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Workflow mix</h2>
            <Badge tone="neutral">{dateRange}</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {agents.map((agent) => {
              const count = callHistory.filter((call) => call.agentId === agent.id).length * rangeMultiplier;
              return (
                <div key={agent.id} className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{agent.name}</p>
                    <Badge tone={agent.statusTone}>{count} calls</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{agent.goal}</p>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Outcome breakdown</h2>
          <div className="mt-4 space-y-3">
            {[
              { label: "Meeting booked", value: booked, tone: "success" as const },
              { label: "Follow-up", value: followUps, tone: "warning" as const },
              { label: "Voicemail / dropped", value: voicemails, tone: "danger" as const }
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-[#fafafe] px-4 py-3">
                <p className="text-sm text-[#4B4B59]">{item.label}</p>
                <Badge tone={item.tone}>{item.value}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Operational insights</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-[#6D6D78]">
            <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
              This view shows that the product does more than place calls: it captures structured outcomes and moves work into the next system.
            </div>
            <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
              The analytics layer is intentionally compact for v1. Deeper slices like latency by vendor, eval scores, or cost by workflow can come later.
            </div>
            <div className="rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4 text-[#5D52D6]">
              Use this surface to validate that workflows are producing measurable outcomes, clean handoffs, and consistent system updates.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
