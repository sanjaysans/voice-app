"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { api } from "@/lib/api-client";
import { useAsyncAction, useKeyedAsyncAction } from "@/lib/use-async-action";
import { Badge, Button, Card, ConfirmActionModal, ContentLoader, EmptyState, Input, Modal, PageHeader, SurfaceLoader, Textarea } from "@/components/ui";

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
  const createAction = useAsyncAction();
  const editAction = useAsyncAction();
  const rowAction = useKeyedAsyncAction();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [hookToDelete, setHookToDelete] = useState<{ id: string; label: string } | null>(null);

  async function loadHooks(options?: { showLoader?: boolean }) {
    if (options?.showLoader) {
      setIsLoading(true);
    }

    try {
      const accounts = await api<ProviderAccountRecord[]>(
        `/api/v1/tenants/${tenantSlug}/provider-accounts`
      );
      setHooks(accounts.filter((item) => item.provider_kind === "webhook"));
    } finally {
      if (options?.showLoader) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!tenantSlug) {
      setHooks([]);
      setIsLoading(false);
      return;
    }
    void loadHooks({ showLoader: true });
  }, [tenantSlug]);

  async function withPagePending<T>(message: string, action: () => Promise<T>) {
    setPendingMessage(message);
    try {
      return await action();
    } finally {
      setPendingMessage(null);
    }
  }

  async function createWebhook() {
    setIsOpen(false);
    await api(`/api/v1/tenants/${tenantSlug}/provider-accounts`, {
      method: "POST",
      body: JSON.stringify({
        provider_kind: "webhook",
        vendor_name: "Webhook",
        label,
        status: "draft",
        config: {
          url,
          events: events.split(",").map((item) => item.trim()).filter(Boolean),
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

  const isMutating = Boolean(pendingMessage);

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

      <div className="flex items-start gap-3 rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#7A4B00]">
        <Badge tone="warning">Delivery worker pending</Badge>
        <p>Endpoints are stored for configuration, but outbound delivery is not connected until the delivery worker is enabled.</p>
      </div>

      {isLoading ? (
        <ContentLoader
          title="Loading webhooks"
          description="Fetching outbound endpoints and recent delivery state for this tenant."
        />
      ) : null}

      {!isLoading ? (
      <div className="relative">
        {isMutating ? <SurfaceLoader message={pendingMessage ?? ""} /> : null}
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
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6D6D78]">Delivery status</p>
                    <p className="mt-2 text-sm font-medium">
                      Not available yet
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
                    loading={rowAction.pendingKey === `delete:${hook.provider_account_id}`}
                    loadingText="Deleting"
                    variant="ghost"
                    onClick={() =>
                      setHookToDelete({ id: hook.provider_account_id, label: hook.label })
                    }
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
            description="Add an endpoint when the delivery worker is enabled. Until then, this page only stores the endpoint configuration."
          />
        )}
      </Card>
      </div>
      ) : null}

      <Modal
        title="Add webhook"
        description="Register a new outbound event endpoint for the current tenant."
        isOpen={isOpen}
        onClose={() => {
          if (createAction.isPending) {
            return;
          }
          setIsOpen(false);
        }}
      >
        <div className="space-y-4">
          <Input label="Label" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Input label="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
          <Textarea label="Events" rows={4} value={events} onChange={(event) => setEvents(event.target.value)} />
          <Button
            className="w-full justify-center"
            loading={createAction.isPending}
            loadingText="Saving webhook"
            onClick={() =>
              void createAction.run(() =>
                withPagePending(`Saving ${label || "webhook"}...`, createWebhook)
              )
            }
          >
            Save webhook
          </Button>
        </div>
      </Modal>

      <Modal
        title="Edit webhook"
        description="Update the endpoint and event subscriptions without exposing stored credentials."
        isOpen={Boolean(editingHook)}
        onClose={() => {
          if (editAction.isPending) {
            return;
          }
          setEditingHook(null);
        }}
      >
        <div className="space-y-4">
          <Input label="Label" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Input label="URL" value={url} onChange={(event) => setUrl(event.target.value)} />
          <Textarea label="Events" rows={4} value={events} onChange={(event) => setEvents(event.target.value)} />
          <Button
            className="w-full justify-center"
            loading={editAction.isPending}
            loadingText="Saving changes"
            onClick={() => void editAction.run(updateWebhook)}
          >
            Save changes
          </Button>
        </div>
      </Modal>

      <ConfirmActionModal
        title="Delete webhook"
        description={
          hookToDelete
            ? `Delete ${hookToDelete.label}? This removes the stored endpoint configuration.`
            : "Delete this webhook? This action cannot be undone."
        }
        confirmLabel="Delete webhook"
        isOpen={Boolean(hookToDelete)}
        isPending={rowAction.pendingKey === `delete:${hookToDelete?.id ?? ""}`}
        onClose={() => setHookToDelete(null)}
        onConfirm={() => {
          if (!hookToDelete) {
            return;
          }
          void rowAction.run(`delete:${hookToDelete.id}`, async () => {
            await removeWebhook(hookToDelete.id);
            setHookToDelete(null);
          });
        }}
      />
    </div>
  );
}
