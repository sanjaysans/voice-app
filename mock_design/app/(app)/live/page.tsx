"use client";

import { activeCalls } from "@/lib/mock-data";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Headphones, Mic2, Radio } from "lucide-react";

export default function LivePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Live monitoring"
        description="Observe active calls, streaming transcript state, escalation posture, and vendor health without leaving the operator workspace."
      />

      <div className="grid gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-3">
          {activeCalls.map((call) => (
            <div key={call.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{call.caller}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{call.agent} • {call.phase}</p>
                </div>
                <Badge tone={call.tone}>{call.status}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#6D6D78]">
                <span>{call.duration}</span>
                <span>{call.vendor}</span>
                <span>{call.sentiment}</span>
              </div>
            </div>
          ))}
        </Card>

        <Card className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Streaming inspection</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Mocked real-time transcript visibility for active calls.</p>
            </div>
            <Badge tone="success">3 live calls</Badge>
          </div>
          <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(102,89,255,0.12)] text-accent">
                <Radio size={18} />
              </div>
              <div>
                <p className="font-medium">Support triage</p>
                <p className="text-sm text-[#6D6D78]">Partial transcript stabilizing after caller interruption</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm text-[#4B4B59]">
                Caller: “the unit still fails after the reset code”
              </div>
              <div className="rounded-xl border border-[rgba(102,89,255,0.18)] bg-[rgba(102,89,255,0.08)] px-4 py-3 text-sm text-[#4B4B59]">
                Agent: “Understood, I’m checking known activation failures for the S3 hardware line.”
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "Listen-in", value: "Operator ready", Icon: Headphones },
              { title: "Barge-in", value: "Disabled", Icon: Mic2 },
              { title: "Escalation", value: "On threshold 2/3", Icon: Radio }
            ].map(({ title, value, Icon }) => (
              <div key={title} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(22,163,74,0.12)] text-success">
                  <Icon size={18} />
                </div>
                <p className="mt-3 text-sm font-medium">{title}</p>
                <p className="mt-1 text-sm text-[#6D6D78]">{value}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
