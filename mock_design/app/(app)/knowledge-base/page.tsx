"use client";

import { useState } from "react";
import { Globe, Plus, RefreshCw, Upload } from "lucide-react";
import { knowledgeBases } from "@/lib/mock-data";
import { Badge, Button, Card, Modal, PageHeader, Select } from "@/components/ui";

export default function KnowledgeBasePage() {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceType, setSourceType] = useState("Website");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Build"
        title="Knowledge base"
        description="Attach websites, docs, and text snippets, then tune retrieval behavior before the call agent relies on them."
        actions={
          <>
            <Button variant="secondary">
              <RefreshCw size={16} />
              Re-crawl all
            </Button>
            <Button onClick={() => setIsOpen(true)}>
              <Plus size={16} />
              Add source
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="space-y-4">
          {knowledgeBases.map((kb) => (
            <div key={kb.name} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{kb.name}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{kb.description}</p>
                </div>
                <Badge tone={kb.tone}>{kb.status}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {[
                  ["Sources", String(kb.sources)],
                  ["Chunks", kb.chunks],
                  ["Recall", kb.recall],
                  ["Updated", kb.updated]
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

        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold">Retrieval tuning</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">
                <p className="text-sm font-medium">Query rewrite instruction</p>
                <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                  Condense recent caller turns into a standalone support query before retrieval. Bias for device model, error code, and account segment.
                </p>
              </div>
              <div className="rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4">
                <p className="text-sm font-medium text-[#4D42D4]">Linked agents</p>
                <p className="mt-2 text-sm leading-6 text-[#5D52D6]">Support triage, Billing concierge, Escalation summary agent</p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Source types</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(102,89,255,0.12)] text-accent">
                  <Globe size={18} />
                </div>
                <div>
                  <p className="font-medium">Website crawling</p>
                  <p className="text-sm text-[#6D6D78]">Docs, help centers, policy pages</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(22,163,74,0.12)] text-success">
                  <Upload size={18} />
                </div>
                <div>
                  <p className="font-medium">Document ingestion</p>
                  <p className="text-sm text-[#6D6D78]">PDFs, slides, SOPs, CSVs, and text snippets</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Add knowledge source"
        description="Mock the intake flow for documents, websites, and reusable text blocks."
      >
        <div className="space-y-4">
          <Select label="Source type" value={sourceType} options={["Website", "Document", "Text snippet"]} onChange={(event) => setSourceType(event.target.value)} />
          <Button className="w-full justify-center" onClick={() => setIsOpen(false)}>
            Create sample source
          </Button>
        </div>
      </Modal>
    </div>
  );
}
