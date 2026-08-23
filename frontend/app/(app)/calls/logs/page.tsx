"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function CallLogsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Call logs"
        description="This surface is intentionally empty until we design the review list, transcript detail, and operator follow-up actions properly."
      />
      <EmptyState
        title="Call logs are not configured yet"
        description="No historical review workflow or call-detail experience is in scope right now, so this page stays intentionally empty."
      />
    </div>
  );
}
