"use client";

import { useState } from "react";
import { Cable, Plus, ShieldCheck } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from "@/components/ui";

export default function ConnectionsPage() {
  const { connections, toggleConnection, addConnection } = useMockApp();
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<"CRM" | "Calendar" | "Knowledge" | "Telephony">("CRM");
  const [vendor, setVendor] = useState("Salesforce");
  const [label, setLabel] = useState("");
  const connected = connections.filter((connection) => connection.status === "Connected").length;

  const handleAddConnection = () => {
    const nextName = label.trim() || `${vendor} ${category.toLowerCase()} connection`;
    addConnection({ category, vendor, name: nextName });
    setLabel("");
    setVendor("Salesforce");
    setCategory("CRM");
    setIsOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Connections"
        description="Just the systems needed to make the first version believable: calling, CRM, calendar, and knowledge sync."
        actions={
          <Button onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            Add connection
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold">Core systems</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Monitor the systems that route calls, sync outcomes, and confirm next steps.</p>
            </div>
            <Badge tone="success">{connected}/{connections.length} connected</Badge>
          </div>

          <div className="mt-5 space-y-3">
            {connections.map((connection) => (
              <div key={connection.id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{connection.name}</p>
                      <Badge tone={connection.tone}>{connection.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#6D6D78]">{connection.description}</p>
                  </div>
                  <Button variant="secondary" onClick={() => toggleConnection(connection.id)}>
                    {connection.status === "Connected" ? "Run health check" : "Retry setup"}
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Category</p>
                    <p className="mt-2 text-sm font-medium">{connection.category}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Vendor</p>
                    <p className="mt-2 text-sm font-medium">{connection.vendor}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Last check</p>
                    <p className="mt-2 text-sm font-medium">{connection.lastChecked}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-border bg-white p-4 text-sm leading-6 text-[#6D6D78]">
                  {connection.detail}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
                <Cable size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Connection coverage</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">The current workspace keeps its critical operating systems visible in one place.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-[#6D6D78]">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">Telephony proves the product can initiate or receive the call.</div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">CRM proves the call turns into actionable system state, not just a transcript.</div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">Calendar proves the conversion moment can close the loop inside the call.</div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">Knowledge sync proves prompts and answers can stay grounded without hardcoding every response.</div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(22,163,74,0.12)] text-success">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Recommended next steps</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Use this queue to focus attention on the next operational improvements.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm leading-6 text-[#6D6D78]">
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">Advanced secret rotation UX and fine-grained tenant permission matrices.</div>
              <div className="rounded-2xl border border-border bg-[#fafafe] p-4">Webhook debugging consoles, long-tail compliance surfaces, and vendor cost breakdowns.</div>
              <div className="rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4 text-[#5D52D6]">
                Prioritize systems that change routing, outcome capture, or scheduling before broadening the operational surface.
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        description="Add a new system connection and keep setup lightweight for the current workflow."
        isOpen={isOpen}
        title="Add connection"
        onClose={() => setIsOpen(false)}
      >
        <div className="space-y-4">
          <Select
            label="Category"
            value={category}
            options={["CRM", "Calendar", "Knowledge", "Telephony"]}
            onChange={(event) => setCategory(event.target.value as "CRM" | "Calendar" | "Knowledge" | "Telephony")}
          />
          <Select
            label="Vendor"
            value={vendor}
            options={["Salesforce", "HubSpot", "Google Calendar", "Notion", "Twilio"]}
            onChange={(event) => setVendor(event.target.value)}
          />
          <Input label="Connection label" placeholder="Production CRM sync" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Button className="w-full justify-center" onClick={handleAddConnection}>
            Save connection
          </Button>
        </div>
      </Modal>
    </div>
  );
}
