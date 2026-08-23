"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function CallsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Calls"
        description="This surface is intentionally empty until we design the launch flow, operator controls, and live call actions properly."
      />
      <EmptyState
        title="Call launch is not configured yet"
        description="No trigger-call workflow or live launch experience is in scope right now, so this page stays intentionally empty."
      />
    </div>
  );
}
