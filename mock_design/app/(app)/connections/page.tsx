"use client";

import { useState } from "react";
import { Cable, Plus, ShieldCheck, Wifi } from "lucide-react";
import { phoneNumbers, vendorCredentials } from "@/lib/mock-data";
import { Badge, Button, Card, Input, Modal, PageHeader, Select } from "@/components/ui";

export default function ConnectionsPage() {
  const [isAddNumberOpen, setIsAddNumberOpen] = useState(false);
  const [numberType, setNumberType] = useState("Local");
  const [region, setRegion] = useState("US");
  const [search, setSearch] = useState("");

  const filteredNumbers = phoneNumbers.filter((item) =>
    `${item.label} ${item.number} ${item.vendor}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Infrastructure"
        title="Telephony connections"
        description="Manage numbers, SIP trunks, and per-tenant provider credentials for STT, LLM, TTS, and telephony."
        actions={
          <Button onClick={() => setIsAddNumberOpen(true)}>
            <Plus size={16} />
            Add number
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Numbers & trunks</h2>
              <p className="mt-1 text-sm text-[#6D6D78]">Phone numbers and ingress pathways assigned to test and production tenants.</p>
            </div>
            <div className="w-full xl:max-w-xs">
              <Input placeholder="Search numbers or vendors" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>

          <div className="space-y-3">
            {filteredNumbers.map((item) => (
              <div key={item.number} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="mt-1 text-sm text-[#6D6D78]">
                      {item.number} • {item.vendor}
                    </p>
                  </div>
                  <Badge tone={item.statusTone}>{item.status}</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Tenant</p>
                    <p className="mt-2 text-sm font-medium">{item.tenant}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Type</p>
                    <p className="mt-2 text-sm font-medium">{item.type}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Health</p>
                    <p className="mt-2 text-sm font-medium">{item.health}</p>
                  </div>
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
                <h2 className="text-lg font-semibold">Vendor credentials</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Tenant-scoped placeholders for API keys and provider secrets.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {vendorCredentials.map((credential) => (
                <div key={credential.vendor} className="rounded-2xl border border-border bg-[#fafafe] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{credential.vendor}</p>
                      <p className="mt-1 text-sm text-[#6D6D78]">{credential.type}</p>
                    </div>
                    <Badge tone={credential.tone}>{credential.status}</Badge>
                  </div>
                  <p className="mt-3 rounded-xl border border-border bg-white px-3 py-2 font-mono text-xs text-[#4B4B59]">
                    {credential.maskedKey}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(22,163,74,0.12)] text-success">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Operational notes</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">Helpful states for future backend integration.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#6D6D78]">
              <p>Credential validation should become tenant-aware and surface scopes, expiration, and last successful handshake.</p>
              <p>Number provisioning can branch into purchase, port-in, or SIP attach flows without changing the shell layout.</p>
              <p className="inline-flex items-center gap-2 rounded-xl bg-[rgba(217,119,6,0.08)] px-3 py-2 text-warning">
                <Wifi size={15} />
                One telephony provider is currently in a warning state in the mock data set.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        description="Simulate number procurement before real provider APIs are connected."
        isOpen={isAddNumberOpen}
        title="Add number"
        onClose={() => setIsAddNumberOpen(false)}
      >
        <div className="space-y-4">
          <Select label="Number type" value={numberType} options={["Local", "Toll-free", "SIP trunk"]} onChange={(event) => setNumberType(event.target.value)} />
          <Select label="Region" value={region} options={["US", "IN", "UK"]} onChange={(event) => setRegion(event.target.value)} />
          <Input label="Friendly label" placeholder="After-hours support" />
          <Button className="w-full justify-center" onClick={() => setIsAddNumberOpen(false)}>
            Reserve sample number
          </Button>
        </div>
      </Modal>
    </div>
  );
}
