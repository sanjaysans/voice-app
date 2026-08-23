"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function QaReviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="QA review"
        description="This surface is intentionally empty until we design the review workflow, scoring model, and operator actions properly."
      />
      <EmptyState
        title="QA review is not configured yet"
        description="No review queue, scoring rubric, or call-audit flow is in scope right now, so this page stays intentionally empty."
      />
    </div>
  );
}
