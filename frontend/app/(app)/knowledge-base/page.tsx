"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function KnowledgeBasePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Knowledge base"
        description="This surface is intentionally empty until we design how reusable knowledge should actually behave."
      />
      <EmptyState
        title="Knowledge is not configured yet"
        description="No knowledge repository or binding UX is in scope right now, so this page stays intentionally empty."
      />
    </div>
  );
}
