"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { api } from "@/lib/api-client";
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Textarea } from "@/components/ui";

type ProviderAccountRecord = {
  provider_account_id: string;
  provider_kind: string;
  vendor_name: string;
  label: string;
  status: string;
  preview: Record<string, unknown>;
};

export default function WebhooksPage() {
  const { tenantSlug } = useMockApp();
  const [hooks, setHooks] = useState<ProviderAccountRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingHook, setEditingHook] = useState<ProviderAccountRecord | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState("call.completed,call.follow_up");

  async function loadHooks() {
    const accounts = await api<ProviderAccountRecord[]>(
      `/api/v1/tenants/${tenantSlug}/provider-accounts`
    );
    setHooks(accounts.filter((item) => item.provider_kind === "webhook"));
  }

  useEffect(() => {
    void loadHooks();
  }, [tenantSlug]);

  async function createWebhook() {
    setIsOpen(false);
    await api(`/api/v1/tenants/${tenantSlug}/provider-accounts`, {
      method: "POST",
      body: JSON.stringify({
        provider_kind: "webhook",
        vendor_name: "Webhook",
        label,
        status: "active",
        config: {
          url,
          events: events.split(",").map((item) => item.trim()).filter(Boolean),
          ui_status: "Connected",
          detail: "Recent deliveries are simulated in the prototype.",
          signing_secret_preview: "whsec_••••••••",
          deliveries: [
            { id: "delivery_1", event: "call.completed", status: "Delivered" },
            { id: "delivery_2", event: "call.follow_up", status: "Retrying" },
          ],
        },
      }),
    });
    setLabel("");
    setUrl("");
    setEvents("call.completed,call.follow_up");
    await loadHooks();
  }

  async function updateWebhook() {
    if (!editingHook) {
      return;
    }
    await api(`/api/v1/tenants/${tenantSlug}/provider-accounts/${editingHook.provider_account_id}`, {
      method: "PATCH",
      body: JSON.stringify({
        label,
        config: {
          ...editingHook.preview,
          url,
          events: events.split(",").map((item) => item.trim()).filter(Boolean),
        },
      }),
    });
    setEditingHook(null);
    setLabel("");
    setUrl("");
    setEvents("call.completed,call.follow_up");
    await loadHooks();
  }

  async function removeWebhook(providerAccountId: string) {
    await api(`/api/v1/tenants/${tenantSlug}/provider-accounts/${providerAccountId}`, {
      method: "DELETE",
    });
    await loadHooks();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Webhooks"
        description="Manage outbound event delivery for CRM, analytics, and downstream workflow listeners."
        actions={
          <Button onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            Add webhook
          </Button>
        }
      />

      <Card>
        {hooks.length ? (
          <div className="space-y-3">
            {hooks.map((hook) => (
              <div key={hook.provider_account_id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{hook.label}</p>
                    <p className="mt-1 text-sm text-[#6D6D78]">
                      {String(hook.preview.url ?? "No URL")} · {hook.status}
                    </p>
                  </div>
                  <Badge tone={hook.status === "active" ? "success" : "warning"}>{hook.status}</Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Events</p>
                    <p className="mt-2 text-sm font-medium">
                      {Array.isArray(hook.preview.events) ? hook.preview.events.join(", ") : "None"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Signing secret</p>
                    <p className="mt-2 text-sm font-medium">
                      {String(hook.preview.signing_secret_preview ?? "Not generated")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingHook(hook);
                      setLabel(hook.label);
                      setUrl(String(hook.preview.url ?? ""));
                      setEvents(
                        Array.isArray(hook.preview.events)
                          ? hook.preview.events.join(",")
                          : "call.completed,call.follow_up"
                      );
                    }}
                  >
                    <Pencil size={16} />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void removeWebhook(hook.provider_account_id)}
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No webhooks configured yet"
            description="Add the first endpoint to simulate delivery logs, signing secrets, and downstream event subscriptions."
          />
        )}
      </Card>

      <Modal
        title="Add webhook"
        description="Register a new outbound event endpoint for the current tenant."
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      >
        <div className="space-y-4">
          <Input label="Label" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Input label="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
          <Textarea label="Events" rows={4} value={events} onChange={(event) => setEvents(event.target.value)} />
          <Button className="w-full justify-center" onClick={() => void createWebhook()}>
            Save webhook
          </Button>
        </div>
      </Modal>

      <Modal
        title="Edit webhook"
        description="Update the endpoint and event list while preserving the existing simulated delivery history."
        isOpen={Boolean(editingHook)}
        onClose={() => setEditingHook(null)}
      >
        <div className="space-y-4">
          <Input label="Label" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Input label="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
          <Textarea label="Events" rows={4} value={events} onChange={(event) => setEvents(event.target.value)} />
          <Button className="w-full justify-center" onClick={() => void updateWebhook()}>
            Save changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
