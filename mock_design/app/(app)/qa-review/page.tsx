"use client";

import { qaQueue } from "@/lib/mock-data";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function QaReviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="QA review"
        description="Review flagged conversations, annotate failure modes, and convert production issues into repeatable regression coverage."
      />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-3">
          {qaQueue.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.caller}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{item.agent} • {item.reason}</p>
                </div>
                <Badge tone={item.tone}>{item.priority}</Badge>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#6D6D78]">{item.note}</p>
            </div>
          ))}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Scorecard dimensions</h2>
          <div className="mt-4 grid gap-3">
            {[
              ["Containment", "Did the agent resolve without human intervention when it should have?"],
              ["Policy adherence", "Did the agent stay inside refund, consent, or compliance boundaries?"],
              ["Tool correctness", "Were the correct tools called with correct arguments?"],
              ["Tone & clarity", "Was the conversation understandable and appropriately paced?"]
            ].map(([title, copy]) => (
              <div key={title} className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="font-medium">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{copy}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
