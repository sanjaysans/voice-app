"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Bot, Layers3, Search } from "lucide-react";
import { agents } from "@/lib/mock-data";
import { Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";

const filters = ["All", "Published", "Draft", "Archived"];

export default function AgentsPage() {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  const filteredAgents = agents.filter((agent) => {
    const matchesFilter = filter === "All" ? true : agent.status === filter;
    const text = `${agent.name} ${agent.description} ${agent.stack.stt} ${agent.stack.llm} ${agent.stack.tts}`.toLowerCase();
    return matchesFilter && text.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Agents"
        description="Manage every deployable voice agent, vendor stack, and prompt set across your tenants."
        actions={
          <>
            <Button asChild href="/agents/builder" variant="secondary">Open builder</Button>
            <Button>New agent</Button>
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
              placeholder="Search agents, vendors, knowledge bases"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        {filteredAgents.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredAgents.map((agent) => (
              <Card key={agent.id} className="border bg-[#fcfcff]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
                        <Bot size={18} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold">{agent.name}</h2>
                        <p className="mt-1 text-sm text-[#6D6D78]">{agent.description}</p>
                      </div>
                    </div>
                  </div>
                  <Badge tone={agent.statusTone}>{agent.status}</Badge>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">STT</p>
                    <p className="mt-2 font-medium">{agent.stack.stt}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">LLM</p>
                    <p className="mt-2 font-medium">{agent.stack.llm}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">TTS</p>
                    <p className="mt-2 font-medium">{agent.stack.tts}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="flex items-center gap-2 text-sm text-[#6D6D78]">
                    <Layers3 size={16} />
                    Last edited {agent.lastEdited}
                  </div>
                  <Link className="inline-flex items-center gap-2 text-sm font-medium text-accent" href="/agents/builder">
                    Edit routing tree
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No agents match this filter"
            description="Use this empty state to validate catalog behavior before backend data and tenant-level permissions are wired in."
          />
        )}
      </Card>
    </div>
  );
}
