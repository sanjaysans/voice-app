"use client";

import { toolsCatalog } from "@/lib/mock-data";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Braces, Workflow } from "lucide-react";

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Tools & variables"
        description="Design pre-call, in-call, and post-call tool behaviors along with schema-to-variable mappings the prompt system can reuse."
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          {toolsCatalog.map((group) => (
            <div key={group.phase} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{group.phase}</h2>
                  <p className="mt-1 text-sm text-[#6D6D78]">{group.description}</p>
                </div>
                <Badge tone="neutral">{group.tools.length} tools</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {group.tools.map((tool) => (
                  <div key={tool.name} className="rounded-xl border border-border bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{tool.name}</p>
                        <p className="mt-1 text-sm text-[#6D6D78]">{tool.purpose}</p>
                      </div>
                      <Badge tone={tool.write ? "warning" : "success"}>{tool.write ? "Write" : "Read"}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tool.mappings.map((mapping) => (
                        <Badge key={mapping} tone="neutral">
                          {mapping}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
                <Braces size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Variable mapping</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Structured outputs become reusable prompt variables.</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-[#fafafe] p-4">
              <p className="text-sm font-medium">Example</p>
              <p className="mt-2 font-mono text-xs leading-6 text-[#4B4B59]">
                api.customer.first_name → {"{{customer_name}}"}{"\n"}
                api.invoice.pdf_url → {"{{invoice_link}}"}{"\n"}
                post_call.sentiment.score → {"{{sentiment_score}}"}
              </p>
            </div>
          </Card>

          <EmptyState
            icon={Workflow}
            title="Approval steps belong here next"
            description="The next UX iteration should add write-tool confirmation policies, dry-run testing, and execution guards per tool."
          />
        </div>
      </div>
    </div>
  );
}
