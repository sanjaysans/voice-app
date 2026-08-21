"use client";

import { workspaceTenants } from "@/lib/mock-data";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function WorkspacesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Workspaces"
        description="Manage tenant boundaries, default vendor policies, region placement, and operational ownership across the Voice platform."
      />

      <Card className="space-y-4">
        {workspaceTenants.map((tenant) => (
          <div key={tenant.name} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{tenant.name}</p>
                <p className="mt-1 text-sm text-[#6D6D78]">{tenant.region} • {tenant.owner}</p>
              </div>
              <Badge tone={tenant.tone}>{tenant.status}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                ["Calls / day", tenant.volume],
                ["Default stack", tenant.stack],
                ["Residency", tenant.residency],
                ["Plan", tenant.plan]
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">{label}</p>
                  <p className="mt-2 text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
