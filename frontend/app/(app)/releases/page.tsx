"use client";

import { useMockApp } from "@/lib/mock-app";
import { Badge, Card, PageHeader } from "@/components/ui";

export default function ReleasesPage() {
  const { agents } = useMockApp();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Releases"
        description="Track which workflows are in draft versus published and which vendor stacks are attached to each release line."
      />

      <Card>
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{agent.name}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">Last edited {agent.lastEdited}</p>
                </div>
                <Badge tone={agent.statusTone}>{agent.status}</Badge>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-white p-3 text-sm font-medium">
                  STT · {agent.stack.stt}
                </div>
                <div className="rounded-xl border border-border bg-white p-3 text-sm font-medium">
                  LLM · {agent.stack.llm}
                </div>
                <div className="rounded-xl border border-border bg-white p-3 text-sm font-medium">
                  TTS · {agent.stack.tts}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
