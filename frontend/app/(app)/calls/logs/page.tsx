"use client";

import { useState } from "react";
import { Clock3, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { useKeyedAsyncAction } from "@/lib/use-async-action";
import { Badge, Button, Card, ConfirmActionModal, EmptyState, PageHeader } from "@/components/ui";

export default function CallLogsPage() {
  const { callHistory, selectedCall, selectCall, markSynced, deleteCall } = useMockApp();
  const reviewAction = useKeyedAsyncAction();
  const [callToDelete, setCallToDelete] = useState<{ id: string; label: string } | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Call logs"
        description="Review completed runs with transcript, extracted variables, tool activity, guardrails, and sync actions."
        actions={
          <Button asChild href="/calls" variant="secondary">
            Back to calls
          </Button>
        }
      />

      {!callHistory.length ? (
        <EmptyState
          title="No call logs yet"
          description="Completed and follow-up calls will appear here once the first workflow run finishes."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <Card>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-lg font-semibold">Review feed</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Select any call to inspect the full review surface.</p>
              </div>
              <Badge tone="neutral">{callHistory.length} calls</Badge>
            </div>

            <div className="mt-5 space-y-3">
              {callHistory.map((call) => (
                <button
                  key={call.id}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedCall?.id === call.id
                      ? "border-[rgba(102,89,255,0.24)] bg-[rgba(102,89,255,0.06)]"
                      : "border-border bg-[#fcfcff] hover:border-[rgba(102,89,255,0.18)]"
                  }`}
                  onClick={() => selectCall(call.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {call.leadName} · {call.company}
                      </p>
                      <p className="mt-1 text-sm text-[#6D6D78]">
                        {call.agentName} · {call.time} · {call.duration}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={call.statusTone}>{call.status}</Badge>
                      <Badge tone={call.syncedToCrm ? "success" : "warning"}>
                        {call.syncedToCrm ? "CRM synced" : "Pending sync"}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#4B4B59]">{call.summary}</p>
                </button>
              ))}
            </div>
          </Card>

          {selectedCall ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Call review</h2>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    Inspect the transcript, structured output, and downstream actions for the selected call.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={selectedCall.statusTone}>{selectedCall.outcome}</Badge>
                  <Button
                    disabled={selectedCall.syncedToCrm}
                    loading={reviewAction.pendingKey === `sync:${selectedCall.id}`}
                    loadingText="Syncing"
                    variant="secondary"
                    onClick={() =>
                      void reviewAction.run(`sync:${selectedCall.id}`, () => markSynced(selectedCall.id))
                    }
                  >
                    {selectedCall.syncedToCrm ? "CRM synced" : "Sync to CRM"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={callHistory.length === 1}
                    loading={reviewAction.pendingKey === `delete:${selectedCall.id}`}
                    loadingText="Deleting"
                    onClick={() =>
                      setCallToDelete({
                        id: selectedCall.id,
                        label: `${selectedCall.leadName} · ${selectedCall.company}`
                      })
                    }
                    title={
                      callHistory.length === 1
                        ? "Keep at least one review record in the prototype"
                        : "Delete call"
                    }
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Lead</p>
                  <p className="mt-2 font-medium">{selectedCall.leadName}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{selectedCall.company}</p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Duration</p>
                  <p className="mt-2 font-medium">{selectedCall.duration}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{selectedCall.vendorTrace}</p>
                </div>
                <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Next step</p>
                  <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{selectedCall.nextStep}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-white p-4">
                    <div className="flex items-center gap-2">
                      <Clock3 size={16} className="text-accent" />
                      <p className="font-medium">Transcript</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedCall.transcript.map((turn) => (
                        <div key={`${turn.timestamp}-${turn.text}`} className="rounded-xl border border-border bg-[#fafafe] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">{turn.speaker}</p>
                            <p className="text-xs text-[#6D6D78]">{turn.timestamp}</p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{turn.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-white p-4">
                    <p className="font-medium">Extracted variables</p>
                    <div className="mt-4 space-y-3">
                      {selectedCall.extractedVariables.map((item) => (
                        <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-[#fafafe] px-4 py-3 text-sm">
                          <span className="text-[#6D6D78]">{item.key}</span>
                          <span className="font-medium">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-white p-4">
                    <p className="font-medium">Tool activity</p>
                    <div className="mt-4 space-y-3">
                      {selectedCall.toolCalls.map((item) => (
                        <div key={item.name} className="rounded-xl border border-border bg-[#fafafe] px-4 py-3">
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="mt-1 text-sm leading-6 text-[#6D6D78]">{item.result}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-white p-4">
                    <p className="font-medium">Guardrails</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedCall.guardrails.map((item) => (
                        <Badge key={item} tone="neutral">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <EmptyState
              title="Choose a call log"
              description="Select one reviewed call from the left to open the transcript and outcome detail."
            />
          )}
        </div>
      )}

      <ConfirmActionModal
        title="Delete call log"
        description={
          callToDelete
            ? `Delete the review record for ${callToDelete.label}? This removes the call log from the prototype and cannot be undone.`
            : "Delete this call log? This action cannot be undone."
        }
        confirmLabel="Delete call"
        isOpen={Boolean(callToDelete)}
        isPending={reviewAction.pendingKey === `delete:${callToDelete?.id ?? ""}`}
        onClose={() => setCallToDelete(null)}
        onConfirm={() => {
          if (!callToDelete) {
            return;
          }
          void reviewAction.run(`delete:${callToDelete.id}`, async () => {
            await deleteCall(callToDelete.id);
            setCallToDelete(null);
          });
        }}
      />
    </div>
  );
}
