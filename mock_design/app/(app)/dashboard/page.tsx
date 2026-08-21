"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Clock3, PhoneCall, RefreshCw, ShieldAlert } from "lucide-react";
import { dashboardStats, navigationSpotlight, recentCalls } from "@/lib/mock-data";
import { Badge, Button, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

const ranges = ["Today", "7D", "30D", "Quarter"];

export default function DashboardPage() {
  const [selectedRange, setSelectedRange] = useState("7D");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timer = window.setTimeout(() => setIsLoading(false), 800);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Monitor live traffic, escalations, and operator attention areas across all tenants."
        actions={
          <>
            <div className="flex rounded-xl border border-border bg-white p-1">
              {ranges.map((range) => (
                <button
                  key={range}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    selectedRange === range ? "bg-[rgba(102,89,255,0.12)] text-accent" : "text-[#6D6D78]"
                  }`}
                  onClick={() => setSelectedRange(range)}
                  type="button"
                >
                  {range}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setIsLoading(true)}>
              <RefreshCw size={16} />
              Refresh
            </Button>
            <Button>New agent</Button>
          </>
        }
      />

      <section className="grid gap-4 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[132px] animate-pulse rounded-2xl border border-border bg-white" />
            ))
          : dashboardStats.map((item, index) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                change={item.change}
                trend={item.trend}
                icon={[PhoneCall, BarChart3, Clock3, ShieldAlert][index]}
              />
            ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Recent calls</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Latest completed, escalated, and dropped conversations.</p>
            </div>
            <Button variant="ghost">View all calls</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fbfbfd] text-[#6D6D78]">
                <tr>
                  {["Caller", "Agent", "Status", "Duration", "Resolution"].map((header) => (
                    <th key={header} className="px-5 py-3 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <tr key={call.id} className="border-t border-border">
                    <td className="px-5 py-4">
                      <div className="font-medium">{call.caller}</div>
                      <div className="mt-1 text-xs text-[#6D6D78]">{call.time}</div>
                    </td>
                    <td className="px-5 py-4">{call.agent}</td>
                    <td className="px-5 py-4">
                      <Badge tone={call.statusTone}>{call.status}</Badge>
                    </td>
                    <td className="px-5 py-4">{call.duration}</td>
                    <td className="px-5 py-4 text-[#6D6D78]">{call.resolution}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold">Workspace modules</h2>
            <div className="mt-4 space-y-3">
              {navigationSpotlight.map((item) => (
                <Link key={item.href} className="block rounded-2xl border border-border bg-[#fafafe] p-4 transition hover:border-[rgba(102,89,255,0.24)] hover:bg-white" href={item.href}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-[#6D6D78]">{item.copy}</p>
                    </div>
                    <Badge tone="neutral">{item.group}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Attention queue</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-[rgba(217,119,6,0.2)] bg-[rgba(217,119,6,0.08)] p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[#17171F]">Escalation spike</p>
                  <Badge tone="warning">Warning</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                  Sales agent escalations are 18% above the prior 24-hour baseline.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[#17171F]">Credential check</p>
                  <Badge tone="danger">Action needed</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                  One tenant has an expiring telephony API key in the connections workspace.
                </p>
              </div>
            </div>
          </Card>

          <EmptyState
            title="No unresolved incidents"
            description="All blocking failures have been acknowledged. New alerts will appear here as the platform scales up."
          />
        </div>
      </section>
    </div>
  );
}
