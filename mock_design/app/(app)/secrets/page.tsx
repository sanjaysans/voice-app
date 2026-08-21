"use client";

import { secretsStore } from "@/lib/mock-data";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function SecretsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Secrets"
        description="Store tenant-scoped credentials, track validation state, and prepare the UX for a proper vault-backed integration later."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {secretsStore.map((group) => (
          <Card key={group.tenant} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{group.tenant}</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">{group.description}</p>
              </div>
              <Badge tone="neutral">{group.keys.length} secrets</Badge>
            </div>
            {group.keys.map((item) => (
              <div key={item.name} className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-1 font-mono text-xs text-[#6D6D78]">{item.value}</p>
                  </div>
                  <Badge tone={item.tone}>{item.status}</Badge>
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
