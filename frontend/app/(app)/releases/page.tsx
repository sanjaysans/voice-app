"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function ReleasesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Releases"
        description="Release management is intentionally out of scope for this phase, so this page stays empty."
      />
      <EmptyState
        title="Releases are not designed yet"
        description="We have not defined versioning, promotion, or release approval UX yet, so this page stays intentionally empty."
      />
    </div>
  );
}
