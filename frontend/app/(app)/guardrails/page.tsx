"use client";

import { EmptyState, PageHeader } from "@/components/ui";

export default function GuardrailsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Guardrails"
        description="Guardrail design is not in scope yet, so this page stays intentionally empty."
      />
      <EmptyState
        title="Guardrails are not configured yet"
        description="We will design policy, validation, and escalation rules later. For now this surface stays intentionally empty."
      />
    </div>
  );
}
