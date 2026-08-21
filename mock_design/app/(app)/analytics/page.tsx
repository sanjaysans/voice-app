"use client";

import { analyticsMetrics, analyticsBreakdowns } from "@/lib/mock-data";
import { PageHeader, StatCard, Card } from "@/components/ui";
import { BarChart3, DollarSign, Gauge, Smile } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Analytics"
        description="Track performance, cost, sentiment, and model/vendor behavior across production conversations."
      />

      <section className="grid gap-4 xl:grid-cols-4">
        {analyticsMetrics.map((item, index) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            change={item.change}
            trend={item.trend}
            icon={[BarChart3, Gauge, Smile, DollarSign][index]}
          />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {analyticsBreakdowns.map((panel) => (
          <Card key={panel.title}>
            <h2 className="text-lg font-semibold">{panel.title}</h2>
            <div className="mt-4 space-y-3">
              {panel.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-[#fafafe] px-4 py-3">
                  <p className="text-sm text-[#4B4B59]">{row.label}</p>
                  <p className="text-sm font-semibold">{row.value}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
