"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Bot, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { useAsyncAction, useKeyedAsyncAction } from "@/lib/use-async-action";
import { Badge, Button, Card, ConfirmActionModal, EmptyState, Input, PageHeader } from "@/components/ui";

const filters = ["All", "Published", "Draft"];

export default function AgentsPage() {
  const router = useRouter();
  const { agents, selectedAgentId, selectAgent, createNewAgent, deleteAgent } = useMockApp();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const createAction = useAsyncAction();
  const deleteAction = useKeyedAsyncAction();
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<{ id: string; name: string } | null>(null);

  const filteredAgents = agents.filter((agent) => {
    const matchesFilter = filter === "All" ? true : agent.status === filter;
    const text = `${agent.name} ${agent.description} ${agent.segment} ${agent.goal} ${agent.stack.stt} ${agent.stack.llm} ${agent.stack.tts}`.toLowerCase();
    return matchesFilter && text.includes(query.toLowerCase());
  });

  const handleCreateAgent = async () => {
    const agent = await createNewAgent(`New flow ${agents.length + 1}`);
    selectAgent(agent.id);
    router.push("/agents/builder");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Agents"
        description="Reusable calling workflows that can route, qualify, serve, or hand off without locking the platform into one vertical."
        actions={
          <>
            <Button asChild href="/agents/builder" variant="secondary">
              Open studio
            </Button>
            <Button
              loading={createAction.isPending}
              loadingText="Creating agent"
              onClick={() => void createAction.run(handleCreateAgent)}
            >
              <Plus size={16} />
              New agent
            </Button>
          </>
        }
      />

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
          <div className="w-full xl:max-w-sm">
            <Input
              icon={Search}
              placeholder="Search workflow, segment, vendor, goal"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {filteredAgents.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredAgents.map((agent) => {
              const isSelected = agent.id === selectedAgentId;

              return (
                <Card key={agent.id} className={isSelected ? "border-[rgba(102,89,255,0.28)] bg-[#fcfbff]" : "bg-[#fcfcff]"}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
                        <Bot size={18} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold">{agent.name}</h2>
                          {isSelected ? <Badge tone="neutral">Selected</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-[#6D6D78]">{agent.description}</p>
                      </div>
                    </div>
                    <Badge tone={agent.statusTone}>{agent.status}</Badge>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Segment</p>
                      <p className="mt-2 text-sm font-medium">{agent.segment}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Primary goal</p>
                      <p className="mt-2 text-sm font-medium">{agent.goal}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-white p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Vendor stack</p>
                      <p className="mt-2 text-sm font-medium">
                        {agent.stack.stt} / {agent.stack.llm} / {agent.stack.tts}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-border bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(102,89,255,0.08)] text-accent">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <p className="font-medium">Why it matters</p>
                        <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                          This workflow keeps the product general-purpose while still supporting a clear qualification and conversion motion.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-sm text-[#6D6D78]">Last edited {agent.lastEdited}</p>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        loading={pendingRoute === `calls:${agent.id}`}
                        loadingText="Opening calls"
                        variant="secondary"
                        onClick={() => {
                          setPendingRoute(`calls:${agent.id}`);
                          selectAgent(agent.id);
                          router.push("/calls");
                        }}
                      >
                        Launch call
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={agents.length === 1}
                        loading={deleteAction.pendingKey === `delete:${agent.id}`}
                        loadingText="Deleting"
                        onClick={() => setAgentToDelete({ id: agent.id, name: agent.name })}
                        title={
                          agents.length === 1
                            ? "Keep at least one workflow in the prototype"
                            : "Delete workflow"
                        }
                      >
                        <Trash2 size={16} />
                        Delete
                      </Button>
                      <button
                        className="inline-flex items-center gap-2 text-sm font-medium text-accent disabled:pointer-events-none disabled:opacity-60"
                        disabled={pendingRoute === `builder:${agent.id}`}
                        onClick={() => {
                          setPendingRoute(`builder:${agent.id}`);
                          selectAgent(agent.id);
                          router.push("/agents/builder");
                        }}
                        type="button"
                      >
                        Edit in studio
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No agents match this filter"
            description="Adjust the current filters or search terms to find an active workflow."
          />
        )}
      </Card>

      <ConfirmActionModal
        title="Delete workflow"
        description={
          agentToDelete
            ? `Delete ${agentToDelete.name}? This removes the workflow from the prototype and cannot be undone.`
            : "Delete this workflow? This action cannot be undone."
        }
        confirmLabel="Delete workflow"
        isOpen={Boolean(agentToDelete)}
        isPending={deleteAction.pendingKey === `delete:${agentToDelete?.id ?? ""}`}
        onClose={() => setAgentToDelete(null)}
        onConfirm={() => {
          if (!agentToDelete) {
            return;
          }
          void deleteAction.run(`delete:${agentToDelete.id}`, async () => {
            await deleteAgent(agentToDelete.id);
            setAgentToDelete(null);
          });
        }}
      />
    </div>
  );
}
