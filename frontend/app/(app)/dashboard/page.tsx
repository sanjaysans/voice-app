"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, CalendarCheck2, PhoneCall, RadioTower, ShieldCheck } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

const dateRanges = ["Today", "7D", "30D", "Quarter"] as const;

function isCallInRange(createdAt: string | undefined, range: string) {
  if (!createdAt) {
    return true;
  }

  const createdDate = new Date(createdAt);
  if (Number.isNaN(createdDate.getTime())) {
    return true;
  }

  const days = range === "Today" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return createdDate >= cutoff;
}

export default function DashboardPage() {
  const router = useRouter();
  const { agents, selectedAgentId, callHistory, connections, dateRange, setDateRange, selectCall } = useMockApp();
  const activeAgentHref = selectedAgentId || agents[0]?.id ? `/agents/${selectedAgentId || agents[0]?.id}` : "/agents";

  const publishedAgents = agents.filter((agent) => agent.status === "Published").length;
  const connectedSystems = connections.filter((connection) => connection.status === "Connected").length;
  const visibleCalls = callHistory.filter(
    (call) => call.isTest !== true && isCallInRange(call.createdAt, dateRange)
  );
  const completedCalls = visibleCalls.filter((call) => call.status === "Completed").length;
  const followUpVolume = visibleCalls.filter((call) => call.status === "Follow-up").length;
  const stackReady = connections.length > 0 && connectedSystems === connections.length;

  const stats = [
    {
      label: "Published agents",
      value: String(publishedAgents),
      change: `${agents.length} total configured`,
      trend: "neutral" as const,
      icon: RadioTower
    },
    {
      label: "Calls reviewed",
      value: String(visibleCalls.length),
      change: `${completedCalls} completed in range`,
      trend: "neutral" as const,
      icon: PhoneCall
    },
    {
      label: "Connected systems",
      value: `${connectedSystems}/${connections.length}`,
      change: stackReady ? "All configured layers healthy" : "Run checks for each layer",
      trend: "neutral" as const,
      icon: ShieldCheck
    },
    {
      label: "Follow-ups queued",
      value: String(followUpVolume),
      change: `${visibleCalls.length} persisted calls in range`,
      trend: "neutral" as const,
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
      detail: connections.length
        ? `${connectedSystems} of ${connections.length} configured integrations passed their latest health check.`
        : "No provider integrations are configured for this workspace yet.",
      href: "/connections",
      cta: "Review connections",
      done: stackReady
    },
    {
      title: "Review the first production call",
      detail: visibleCalls.length
        ? "Open Call logs to inspect transcripts, outcomes, and any pending CRM sync work."
        : "No production call has been recorded in this range. Browser tests remain available from the Live console.",
      href: "/calls/logs",
      cta: "Open call logs",
      done: visibleCalls.length > 0
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
              {dateRanges.map((range) => (
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
            <Button asChild href="/live">New live test</Button>
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
            <Badge tone={stackReady ? "success" : "warning"}>
              {stackReady ? "Ready to launch" : "Needs setup"}
            </Badge>
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
                  Metrics on this page are derived from persisted workspace records. Browser tests stay separate from production call totals so operators can trust the activity view.
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
            <Link className="text-sm font-medium text-accent" href="/calls/logs">
              Open call logs
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {visibleCalls.length ? (
              visibleCalls.slice(0, 4).map((call) => (
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
                  {call.summary ? (
                    <p className="mt-3 text-sm leading-6 text-[#4B4B59]">{call.summary}</p>
                  ) : null}
                  <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-accent">
                    Review call
                    <ArrowRight size={15} />
                  </div>
                </button>
              ))
            ) : (
              <EmptyState
                title="No reviewed calls yet"
                description={`No persisted production calls were recorded in ${dateRange}. Run a real call or change the date range to review activity here.`}
              />
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
