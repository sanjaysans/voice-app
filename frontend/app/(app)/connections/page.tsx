"use client";

import { useMemo, useState } from "react";
import { Cable, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { ConfigFields } from "@/components/config-fields";
import { Badge, Button, Card, ConfirmActionModal, EmptyState, Modal, PageHeader, Select, SurfaceLoader } from "@/components/ui";
import { useMockApp } from "@/lib/mock-app";
import { useAsyncAction, useKeyedAsyncAction } from "@/lib/use-async-action";
import {
  buildDefaultConnectionConfig,
  getProviderDefinition,
  getProviderLabel,
  getProviderOptions,
  parsePhoneNumbers,
  summarizeConnection,
  type SupportedProviderKind,
} from "@/lib/voice-stack";

const connectionKinds: Array<{ kind: SupportedProviderKind; label: string; eyebrow: string }> = [
  { kind: "telephony", label: "Telephony", eyebrow: "Transport" },
  { kind: "stt", label: "Speech to text", eyebrow: "Input" },
  { kind: "llm", label: "LLM", eyebrow: "Reasoning" },
  { kind: "tts", label: "Text to speech", eyebrow: "Output" }
];

export default function ConnectionsPage() {
  const { providerAccounts, toggleConnection, addConnection, updateConnection, deleteConnection } =
    useMockApp();
  const addAction = useAsyncAction();
  const editAction = useAsyncAction();
  const rowAction = useKeyedAsyncAction();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [providerKind, setProviderKind] = useState<SupportedProviderKind>("telephony");
  const [vendorName, setVendorName] = useState("twilio");
  const [config, setConfig] = useState<Record<string, unknown>>(
    buildDefaultConnectionConfig("telephony", "twilio")
  );
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [connectionToDelete, setConnectionToDelete] = useState<{ id: string; label: string } | null>(null);

  const editingConnection = providerAccounts.find((account) => account.id === editingId) ?? null;
  const activeDefinition = getProviderDefinition(providerKind, vendorName);
  const configuredLayerCount = connectionKinds.filter((section) =>
    providerAccounts.some(
      (account) =>
        account.providerKind === section.kind &&
        (account.status === "active" || account.status === "configured")
    )
  ).length;

  function resetComposer() {
    setProviderKind("telephony");
    setVendorName("twilio");
    setConfig(buildDefaultConnectionConfig("telephony", "twilio"));
    setEditingId(null);
  }

  function handleFieldChange(fieldId: string, value: string | number | boolean) {
    setConfig((current) => ({ ...current, [fieldId]: value }));
  }

  async function withPagePending<T>(message: string, action: () => Promise<T>) {
    setPendingMessage(message);
    try {
      return await action();
    } finally {
      setPendingMessage(null);
    }
  }

  function handleKindChange(nextKind: SupportedProviderKind) {
    const nextVendor = getProviderOptions(nextKind)[0]?.value ?? "";
    setProviderKind(nextKind);
    setVendorName(nextVendor);
    setConfig(buildDefaultConnectionConfig(nextKind, nextVendor));
  }

  function handleVendorChange(nextVendor: string) {
    setVendorName(nextVendor);
    setConfig(buildDefaultConnectionConfig(providerKind, nextVendor));
  }

  function handleEditStart(connectionId: string) {
    const target = providerAccounts.find((account) => account.id === connectionId);
    if (!target) {
      return;
    }
    setEditingId(connectionId);
    setProviderKind(target.providerKind);
    setVendorName(target.vendorName);
    setConfig(target.preview);
  }

  async function handleAddConnection() {
    const label =
      String(config.display_name || "").trim() ||
      `${getProviderLabel(providerKind, vendorName)} ${providerKind.toUpperCase()}`;
    await addConnection({
      providerKind,
      vendorName,
      label,
      status: "active",
      config: {
        ...config,
        kind: providerKind,
        display_name: label,
        ui_status: "Connected",
        detail: `${label} is configured and ready for agent setup.`,
        last_checked: "Configured now"
      }
    });
    setIsOpen(false);
    resetComposer();
  }

  async function handleSaveConnection() {
    if (!editingConnection) {
      return;
    }
    const label =
      String(config.display_name || editingConnection.label).trim() || editingConnection.label;
    await updateConnection(editingConnection.id, {
      providerKind,
      vendorName,
      label,
      status: "draft",
      config: {
        ...config,
        kind: providerKind,
        display_name: label,
        ui_status: "Pending",
        detail: `${label} was updated. Run health check again to verify the latest credentials and setup.`,
        last_checked: "Pending verification"
      }
    });
    setEditingId(null);
    resetComposer();
  }

  const groupedAccounts = useMemo(
    () =>
      connectionKinds.map((section) => ({
        ...section,
        items: providerAccounts.filter((account) => account.providerKind === section.kind)
      })),
    [providerAccounts]
  );
  const isMutating = Boolean(pendingMessage);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Connections"
        description="Create the callable stack first: telephony, STT, LLM, and TTS. Agent configuration only selects from what is connected here."
        actions={
          <Button onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            Add connection
          </Button>
        }
      />

      <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {isMutating ? <SurfaceLoader message={pendingMessage ?? ""} /> : null}
        <div className="space-y-6">
          {groupedAccounts.map((section) => (
            <Card key={section.kind}>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                    {section.eyebrow}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold">{section.label}</h2>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    Only connected providers from this layer appear inside agent runtime config.
                  </p>
                </div>
                <Badge tone="neutral">{section.items.length} configured</Badge>
              </div>

              {section.items.length ? (
                <div className="mt-5 space-y-3">
                  {section.items.map((connection) => {
                    const phoneNumbers =
                      connection.providerKind === "telephony"
                        ? parsePhoneNumbers(connection.preview.phone_numbers)
                        : [];
                    const statusTone =
                      connection.status === "error"
                        ? "warning"
                        : connection.status === "draft"
                          ? "neutral"
                          : "success";

                    return (
                      <div
                        key={connection.id}
                        className="rounded-2xl border border-border bg-[#fcfcff] p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{connection.label}</p>
                              <Badge tone={statusTone}>
                                {String(connection.preview.ui_status || connection.status)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-[#6D6D78]">
                              {getProviderLabel(connection.providerKind, connection.vendorName)} ·{" "}
                              {summarizeConnection(connection)}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-[#6D6D78]">
                              {String(connection.preview.detail || "Connection ready for use.")}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              loading={rowAction.pendingKey === `health:${connection.id}`}
                              loadingText="Checking"
                              variant="secondary"
                              onClick={() =>
                                void rowAction.run(`health:${connection.id}`, () =>
                                  toggleConnection(connection.id)
                                )
                              }
                            >
                              Run health check
                            </Button>
                            <Button variant="ghost" onClick={() => handleEditStart(connection.id)}>
                              <Pencil size={16} />
                              Edit
                            </Button>
                            <Button
                              loading={rowAction.pendingKey === `delete:${connection.id}`}
                              loadingText="Deleting"
                              variant="ghost"
                              onClick={() =>
                                setConnectionToDelete({ id: connection.id, label: connection.label })
                              }
                            >
                              <Trash2 size={16} />
                              Delete
                            </Button>
                          </div>
                        </div>

                        {phoneNumbers.length ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {phoneNumbers.map((phoneNumber) => (
                              <span
                                key={phoneNumber}
                                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[#4B4B59]"
                              >
                                {phoneNumber}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyState
                    title={`No ${section.label.toLowerCase()} connection yet`}
                    description={`Add the first ${section.label.toLowerCase()} provider so agents can bind this runtime layer.`}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(102,89,255,0.12)] text-accent">
                <Cable size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Stack readiness</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">
                  Keep the connected stack explicit before designing or launching agents.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {connectionKinds.map((section) => {
                const hasLayer = providerAccounts.some(
                  (account) => account.providerKind === section.kind
                );
                return (
                  <div
                    key={section.kind}
                    className="flex items-center justify-between rounded-2xl border border-border bg-[#fafafe] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#17171F]">{section.label}</p>
                      <p className="mt-1 text-xs text-[#6D6D78]">
                        {hasLayer
                          ? "Available to agents"
                          : "Missing from the callable stack"}
                      </p>
                    </div>
                    <Badge tone={hasLayer ? "success" : "warning"}>
                      {hasLayer ? "Ready" : "Required"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(22,163,74,0.12)] text-success">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Current rule</h2>
                <p className="mt-1 text-sm text-[#6D6D78]">
                  Agents can only select connected providers from this page. Health checks validate saved credentials and setup fields here; model, voice, and language stay at the agent runtime layer.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[rgba(102,89,255,0.16)] bg-[rgba(102,89,255,0.08)] p-4 text-sm leading-6 text-[#5D52D6]">
              {configuredLayerCount === 4
                ? "The full 3-layer stack plus telephony is configured. Agents can now bind a complete runtime."
                : "Finish the four core layers first. Once connected here, the exact vendor-specific runtime options appear in Agent studio automatically."}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        description="Configure a supported provider and make it available to agent runtime setup."
        isOpen={isOpen}
        title="Add connection"
        onClose={() => {
          if (addAction.isPending) {
            return;
          }
          setIsOpen(false);
          resetComposer();
        }}
      >
        <div className="space-y-4">
          <Select
            label="Layer"
            options={connectionKinds.map((section) => ({
              label: section.label,
              value: section.kind
            }))}
            value={providerKind}
            onChange={(event) => handleKindChange(event.target.value as SupportedProviderKind)}
          />
          <Select
            label="Vendor"
            options={getProviderOptions(providerKind)}
            value={vendorName}
            onChange={(event) => handleVendorChange(event.target.value)}
          />
          {activeDefinition ? (
            <ConfigFields
              fields={activeDefinition.connectionFields}
              values={config}
              onChange={handleFieldChange}
            />
          ) : null}
          <Button
            className="w-full justify-center"
            loading={addAction.isPending}
            loadingText="Saving connection"
            onClick={() =>
              void addAction.run(() =>
                withPagePending(
                  `Saving ${getProviderLabel(providerKind, vendorName)} connection...`,
                  handleAddConnection
                )
              )
            }
          >
            Save connection
          </Button>
        </div>
      </Modal>

      <Modal
        description="Refine provider credentials or defaults without changing the agent surfaces directly."
        isOpen={Boolean(editingConnection)}
        title="Edit connection"
        onClose={() => {
          if (editAction.isPending) {
            return;
          }
          resetComposer();
        }}
      >
        <div className="space-y-4">
          <Select
            label="Layer"
            options={connectionKinds.map((section) => ({
              label: section.label,
              value: section.kind
            }))}
            value={providerKind}
            onChange={(event) => handleKindChange(event.target.value as SupportedProviderKind)}
          />
          <Select
            label="Vendor"
            options={getProviderOptions(providerKind)}
            value={vendorName}
            onChange={(event) => handleVendorChange(event.target.value)}
          />
          {activeDefinition ? (
            <ConfigFields
              fields={activeDefinition.connectionFields}
              values={config}
              onChange={handleFieldChange}
            />
          ) : null}
          <Button
            className="w-full justify-center"
            loading={editAction.isPending}
            loadingText="Saving changes"
            onClick={() => void editAction.run(handleSaveConnection)}
          >
            Save changes
          </Button>
        </div>
      </Modal>

      <ConfirmActionModal
        title="Delete connection"
        description={
          connectionToDelete
            ? `Delete ${connectionToDelete.label}? Agents using this provider will lose access to it until the connection is added again.`
            : "Delete this connection? This action cannot be undone."
        }
        confirmLabel="Delete connection"
        isOpen={Boolean(connectionToDelete)}
        isPending={rowAction.pendingKey === `delete:${connectionToDelete?.id ?? ""}`}
        onClose={() => setConnectionToDelete(null)}
        onConfirm={() => {
          if (!connectionToDelete) {
            return;
          }
          void rowAction.run(`delete:${connectionToDelete.id}`, async () => {
            await deleteConnection(connectionToDelete.id);
            setConnectionToDelete(null);
          });
        }}
      />
    </div>
  );
}
