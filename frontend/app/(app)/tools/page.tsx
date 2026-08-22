"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Tools"
        description="This surface is intentionally empty until we define the actual tool model and execution UX."
      />
      <EmptyState
        title="Tools are not configured yet"
        description="We have not designed shared tools for this product version yet, so this page stays intentionally empty."
      />
    </div>
  );
}
