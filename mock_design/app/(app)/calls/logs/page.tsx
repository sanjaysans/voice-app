"use client";

import { useState } from "react";
import { Filter, Search } from "lucide-react";
import { callLogs } from "@/lib/mock-data";
import { MockAudioPlayer } from "@/components/mock-audio-player";
import { Badge, Card, EmptyState, Input, PageHeader } from "@/components/ui";

const filters = ["All", "Completed", "Escalated", "Dropped"];

export default function CallLogsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const filteredLogs = callLogs.filter((call) => {
    const matchesFilter = filter === "All" ? true : call.status === filter;
    const haystack = `${call.caller} ${call.agent} ${call.intent}`.toLowerCase();
    return matchesFilter && haystack.includes(search.toLowerCase());
  });
  const [selectedId, setSelectedId] = useState(callLogs[0].id);
  const selectedCall = filteredLogs.find((call) => call.id === selectedId) ?? filteredLogs[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Call logs"
        description="Inspect transcripts, tool calls, extracted variables, and guardrail flags for completed conversations."
      />

      <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item}
                  className={`rounded-xl px-3 py-2 text-sm transition ${
                    filter === item ? "bg-[rgba(102,89,255,0.12)] text-accent" : "bg-[#fafafe] text-[#6D6D78]"
                  }`}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="w-full xl:max-w-xs">
              <Input icon={Search} placeholder="Search caller or intent" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          {filteredLogs.length ? (
            <div className="space-y-3">
              {filteredLogs.map((call) => (
                <button
                  key={call.id}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedCall?.id === call.id ? "border-[rgba(102,89,255,0.28)] bg-[rgba(102,89,255,0.08)]" : "border-border bg-white"
                  }`}
                  onClick={() => setSelectedId(call.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{call.caller}</p>
                      <p className="mt-1 text-sm text-[#6D6D78]">
                        {call.agent} • {call.time}
                      </p>
                    </div>
                    <Badge tone={call.statusTone}>{call.status}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#6D6D78]">
                    <span>{call.intent}</span>
                    <span>{call.duration}</span>
                    <span>{call.vendorTrace}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No call logs match these filters"
              description="This empty state helps validate log filtering and detail-pane fallback behavior before real APIs land."
              icon={Filter}
            />
          )}
        </Card>

        <Card className="space-y-5">
          {selectedCall ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{selectedCall.caller}</h2>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    {selectedCall.agent} • {selectedCall.intent} • {selectedCall.duration}
                  </p>
                </div>
                <Badge tone={selectedCall.statusTone}>{selectedCall.status}</Badge>
              </div>

              <MockAudioPlayer duration={selectedCall.duration} />

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Variables</p>
                  <div className="mt-3 space-y-3">
                    {selectedCall.variables.map((item) => (
                      <div key={item.key}>
                        <p className="text-xs text-[#6D6D78]">{item.key}</p>
                        <p className="mt-1 text-sm font-medium">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Tool calls</p>
                  <div className="mt-3 space-y-3">
                    {selectedCall.toolCalls.map((item) => (
                      <div key={item.name} className="rounded-xl border border-border bg-white px-3 py-3">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="mt-1 text-xs text-[#6D6D78]">{item.result}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Guardrail flags</p>
                  <div className="mt-3 space-y-2">
                    {selectedCall.guardrails.map((item) => (
                      <Badge key={item} tone="warning">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-white p-4">
                <p className="text-sm font-medium">Transcript</p>
                <div className="mt-4 space-y-4">
                  {selectedCall.transcript.map((turn) => (
                    <div key={`${turn.speaker}-${turn.text.slice(0, 20)}`} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{turn.speaker}</p>
                        <p className="text-xs text-[#6D6D78]">{turn.timestamp}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{turn.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title="Select a call to inspect details"
              description="Transcript, audio, extracted variables, and tool-call history will appear here."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
