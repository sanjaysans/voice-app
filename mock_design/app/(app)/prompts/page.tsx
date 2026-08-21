"use client";

import { useState } from "react";
import { Search, WandSparkles } from "lucide-react";
import { promptConfigs } from "@/lib/mock-data";
import { Badge, Button, Card, Input, PageHeader, Textarea } from "@/components/ui";

export default function PromptsPage() {
  const [selectedId, setSelectedId] = useState(promptConfigs[0].id);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(promptConfigs);
  const filtered = items.filter((item) =>
    `${item.name} ${item.scope} ${item.voice}`.toLowerCase().includes(search.toLowerCase())
  );
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? items[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Prompt studio"
        description="Manage scoped prompts, first-message behavior, fallback language, and variable-driven personalization across agent nodes."
        actions={
          <>
            <Button variant="secondary">
              <WandSparkles size={16} />
              Generate variant
            </Button>
            <Button>Save draft</Button>
          </>
        }
      />

      <div className="grid gap-6 2xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="space-y-4">
          <Input icon={Search} placeholder="Search prompts or voices" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="space-y-3">
            {filtered.map((item) => (
              <button
                key={item.id}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selected?.id === item.id ? "border-[rgba(102,89,255,0.28)] bg-[rgba(102,89,255,0.08)]" : "border-border bg-white"
                }`}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-1 text-sm text-[#6D6D78]">{item.scope}</p>
                  </div>
                  <Badge tone={item.tone}>{item.status}</Badge>
                </div>
                <p className="mt-3 text-xs text-[#6D6D78]">{item.voice} • {item.lastEdited}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">{selected.scope}</p>
            </div>
            <Badge tone={selected.tone}>{selected.status}</Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Voice", selected.voice],
              ["Variables", selected.variables.join(", ")],
              ["Fallback", selected.fallback]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">{label}</p>
                <p className="mt-2 text-sm font-medium text-[#17171F]">{value}</p>
              </div>
            ))}
          </div>

          <Textarea
            label="System prompt"
            rows={12}
            value={selected.prompt}
            onChange={(event) =>
              setItems((current) => current.map((item) => (item.id === selected.id ? { ...item, prompt: event.target.value } : item)))
            }
          />

          <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
            <p className="text-sm font-medium">First message</p>
            <p className="mt-2 text-sm leading-6 text-[#4B4B59]">{selected.firstMessage}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
