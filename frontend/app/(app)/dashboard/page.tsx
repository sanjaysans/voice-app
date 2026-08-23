"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, CalendarCheck2, PhoneCall, RadioTower, ShieldCheck } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { rangeMultipliers } from "@/lib/mock-data";
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

export default function DashboardPage() {
  const router = useRouter();
  const { agents, selectedAgentId, callHistory, connections, dateRange, setDateRange, selectCall } = useMockApp();
  const activeAgentHref = selectedAgentId || agents[0]?.id ? `/agents/${selectedAgentId || agents[0]?.id}` : "/agents";

  const publishedAgents = agents.filter((agent) => agent.status === "Published").length;
  const connectedSystems = connections.filter((connection) => connection.status === "Connected").length;
  const bookedCalls = callHistory.filter((call) => call.outcome === "Meeting booked").length;
  const followUps = callHistory.filter((call) => call.outcome === "Follow-up").length;
  const rangeMultiplier = rangeMultipliers[dateRange as keyof typeof rangeMultipliers] ?? 1;
  const reviewedCalls = callHistory.length * rangeMultiplier;
  const routedMeetings = bookedCalls * rangeMultiplier;
  const followUpVolume = followUps * rangeMultiplier;

  const stats = [
    {
      label: "Published agents",
      value: String(publishedAgents),
      change: `${agents.length - publishedAgents} in draft`,
      trend: "up" as const,
      icon: RadioTower
    },
    {
      label: "Calls reviewed",
      value: String(reviewedCalls),
      change: `${routedMeetings} moved to a meeting`,
      trend: "up" as const,
      icon: PhoneCall
    },
    {
      label: "Connected systems",
      value: `${connectedSystems}/${connections.length}`,
      change: "Core stack online",
      trend: "up" as const,
      icon: ShieldCheck
    },
    {
      label: "Follow-ups queued",
      value: String(followUpVolume),
      change: "Human handoff still visible",
      trend: "up" as const,
      icon: CalendarCheck2
    }
  ];

  const readiness = [
    {
      title: "Publish the primary workflow",
      detail: `${publishedAgents} of ${agents.length} agents are published and available for launch.`,
      href: activeAgentHref,
      cta: "Open agent",
      done: publishedAgents > 0
    },
    {
      title: "Verify launch dependencies",
      detail: `${connectedSystems} integrations are connected for the active workflow.`,
      href: "/connections",
      cta: "Review connections",
      done: connectedSystems >= 3
    },
    {
      title: "Run the primary call flow",
      detail: "Use the qualification flow to validate routing, outcome capture, and next-step booking.",
      href: "/calls",
      cta: "Launch call",
      done: callHistory.some((call) => call.outcome === "Meeting booked")
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Dashboard"
        description="Monitor workflow readiness, launch activity, and outcome review across the active calling operation."
        actions={
          <>
            <div className="flex rounded-xl border border-border bg-white p-1">
              {["Today", "7D", "30D", "Quarter"].map((range) => (
                <button
                  key={range}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    dateRange === range ? "bg-[rgba(102,89,255,0.12)] text-accent" : "text-[#6D6D78]"
                  }`}
                  onClick={() => setDateRange(range)}
                  type="button"
                >
                  {range}
                </button>
              ))}
            </div>
            <Button asChild href={activeAgentHref} variant="secondary">
              Refine agent
            </Button>
            <Button asChild href="/calls">New call</Button>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-4">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold">Readiness checklist</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Keep the core workflow healthy from configuration through reviewed outcomes.</p>
            </div>
            <Badge tone="success">Operational</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {readiness.map((item) => (
              <div key={item.title} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge tone={item.done ? "success" : "warning"}>{item.done ? "Ready" : "Pending"}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{item.detail}</p>
                  </div>
                  <Button asChild href={item.href} variant="secondary">
                    {item.cta}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-[rgba(102,89,255,0.14)] bg-[rgba(102,89,255,0.06)] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-accent">
                <Activity size={18} />
              </div>
              <div>
                <p className="font-medium">Workflow posture</p>
                <p className="mt-2 text-sm leading-6 text-[#5D52D6]">
                  The current workflow is optimized for qualification and conversion, while the routing, connections, and review model remain reusable across future call programs.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold">Recent call reviews</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Click any call to jump into the review surface.</p>
            </div>
            <Link className="text-sm font-medium text-accent" href="/calls/logs" prefetch={false}>
              Open call logs
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {callHistory.length ? (
              callHistory.slice(0, 4).map((call) => (
                <button
                  key={call.id}
                  className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:border-[rgba(102,89,255,0.24)] hover:bg-[#fcfcff]"
                  onClick={() => {
                    selectCall(call.id);
                    router.push("/calls/logs");
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {call.leadName} · {call.company}
                      </p>
                      <p className="mt-1 text-sm text-[#6D6D78]">
                        {call.agentName} · {call.time}
                      </p>
                    </div>
                    <Badge tone={call.statusTone}>{call.outcome}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#4B4B59]">{call.summary}</p>
                  <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent">
                    Review call
                    <ArrowRight size={15} />
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                title="No reviewed calls yet"
                description="Run the first call to populate review history, outcomes, and downstream sync signals here."
              />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
