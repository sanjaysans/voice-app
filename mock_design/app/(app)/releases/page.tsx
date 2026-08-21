"use client";

import { releaseItems } from "@/lib/mock-data";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { GitCompareArrows, Rocket } from "lucide-react";

export default function ReleasesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Releases"
        description="Track config versions, canary status, shadow runs, and rollback readiness before product changes hit live callers."
        actions={
          <>
            <Button variant="secondary">
              <GitCompareArrows size={16} />
              Compare versions
            </Button>
            <Button>
              <Rocket size={16} />
              Promote release
            </Button>
          </>
        }
      />

      <Card className="space-y-4">
        {releaseItems.map((item) => (
          <div key={item.version} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.version}</p>
                <p className="mt-1 text-sm text-[#6D6D78]">{item.summary}</p>
              </div>
              <Badge tone={item.tone}>{item.status}</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                ["Agent", item.agent],
                ["Traffic", item.traffic],
                ["Eval gate", item.evalGate],
                ["Edited", item.edited]
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
