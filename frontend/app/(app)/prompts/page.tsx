"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function PromptsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Prompts"
        description="This surface is intentionally empty for now while we stay focused on the core routing and runtime workflow."
      />
      <EmptyState
        title="Prompts are not designed yet"
        description="We have not scoped a standalone prompt management flow yet, so this page stays intentionally empty."
      />
    </div>
  );
}
