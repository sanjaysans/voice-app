"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Analytics"
        description="This surface is intentionally empty until we design the metrics model, charting approach, and operator decisions it should support."
      />
      <EmptyState
        title="Analytics is not configured yet"
        description="No reporting model, dashboards, or drill-down behavior is in scope right now, so this page stays intentionally empty."
      />
    </div>
  );
}
