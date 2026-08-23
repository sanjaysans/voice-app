"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { api } from "@/lib/api-client";
import { useAsyncAction, useKeyedAsyncAction } from "@/lib/use-async-action";
import { Badge, Button, Card, ConfirmActionModal, ContentLoader, Input, Modal, PageHeader, SurfaceLoader } from "@/components/ui";

type WorkspaceRecord = {
  workspace_id: string;
  name: string;
  is_default: boolean;
};

export default function WorkspacesPage() {
  const { tenantSlug, workspaceId, workspaceOptions, reloadWorkspaceContext } = useMockApp();
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceRecord | null>(null);
  const [name, setName] = useState("");
  const createAction = useAsyncAction();
  const saveAction = useAsyncAction();
  const rowAction = useKeyedAsyncAction();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<WorkspaceRecord | null>(null);

  useEffect(() => {
    setWorkspaces(
      workspaceOptions.map((workspace) => ({
        workspace_id: workspace.workspace_id,
        name: workspace.name,
        is_default: workspace.is_default,
      }))
    );
    setIsLoading(false);
  }, [workspaceOptions]);

  async function withPagePending<T>(message: string, action: () => Promise<T>) {
    setPendingMessage(message);
    try {
      return await action();
    } finally {
      setPendingMessage(null);
    }
  }

  async function createWorkspace() {
    setIsOpen(false);
    await api(`/api/v1/tenants/${tenantSlug}/workspaces`, {
      method: "POST",
      body: JSON.stringify({ name, is_default: false }),
    });
    setName("");
    await reloadWorkspaceContext();
  }

  async function saveWorkspace() {
    if (!editingWorkspace) {
      return;
    }
    await api(`/api/v1/tenants/${tenantSlug}/workspaces/${editingWorkspace.workspace_id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    setEditingWorkspace(null);
    setName("");
    await reloadWorkspaceContext(editingWorkspace.workspace_id);
  }

  async function makeDefault(nextWorkspace: WorkspaceRecord) {
    await api(`/api/v1/tenants/${tenantSlug}/workspaces/${nextWorkspace.workspace_id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_default: true }),
    });
    await reloadWorkspaceContext(nextWorkspace.workspace_id);
  }

  async function removeWorkspace(nextWorkspace: WorkspaceRecord) {
    await api(`/api/v1/tenants/${tenantSlug}/workspaces/${nextWorkspace.workspace_id}`, {
      method: "DELETE",
    });
    await reloadWorkspaceContext();
  }

  const isMutating = Boolean(pendingMessage);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Workspaces"
        description="Keep tenant workspaces lightweight for now while making the default operating surface explicit."
        actions={
          <Button onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            New workspace
          </Button>
        }
      />

      {isLoading ? (
        <ContentLoader
          title="Loading workspaces"
          description="Fetching the tenant workspace list and the current default context."
        />
      ) : null}

      {!isLoading ? (
      <div className="relative">
        {isMutating ? <SurfaceLoader message={pendingMessage ?? ""} /> : null}
        <Card>
        <div className="space-y-3">
          {workspaces.map((workspace) => (
            <div key={workspace.workspace_id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{workspace.name}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">
                    {workspace.workspace_id === workspaceId ? "Currently loaded in the app shell" : "Available workspace"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={workspace.is_default ? "success" : "neutral"}>
                    {workspace.is_default ? "Default" : "Secondary"}
                  </Badge>
                  {!workspace.is_default ? (
                    <Button
                      loading={rowAction.pendingKey === `default:${workspace.workspace_id}`}
                      loadingText="Saving"
                      variant="secondary"
                      onClick={() =>
                        void rowAction.run(`default:${workspace.workspace_id}`, () =>
                          withPagePending(`Switching default to ${workspace.name}...`, () =>
                            makeDefault(workspace)
                          )
                        )
                      }
                    >
                      Make default
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingWorkspace(workspace);
                      setName(workspace.name);
                    }}
                  >
                    <Pencil size={16} />
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={workspaces.length === 1}
                    loading={rowAction.pendingKey === `delete:${workspace.workspace_id}`}
                    loadingText="Deleting"
                    onClick={() => setWorkspaceToDelete(workspace)}
                    title={
                      workspaces.length === 1
                        ? "Keep at least one workspace in the prototype"
                        : "Delete workspace"
                    }
                  >
                    <Trash2 size={16} />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        </Card>
      </div>
      ) : null}

      <Modal
        title="Create workspace"
        description="Add another tenant workspace without changing the current default context."
        isOpen={isOpen}
        onClose={() => {
          if (createAction.isPending) {
            return;
          }
          setIsOpen(false);
        }}
      >
        <div className="space-y-4">
          <Input label="Workspace name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button
            className="w-full justify-center"
            loading={createAction.isPending}
            loadingText="Saving workspace"
            onClick={() =>
              void createAction.run(() =>
                withPagePending(`Creating ${name || "workspace"}...`, createWorkspace)
              )
            }
          >
            Save workspace
          </Button>
        </div>
      </Modal>

      <Modal
        title="Rename workspace"
        description="Keep workspace naming clear while preserving the current tenant structure."
        isOpen={Boolean(editingWorkspace)}
        onClose={() => {
          if (saveAction.isPending) {
            return;
          }
          setEditingWorkspace(null);
        }}
      >
        <div className="space-y-4">
          <Input label="Workspace name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button
            className="w-full justify-center"
            loading={saveAction.isPending}
            loadingText="Saving changes"
            onClick={() => void saveAction.run(saveWorkspace)}
          >
            Save changes
          </Button>
        </div>
      </Modal>

      <ConfirmActionModal
        title="Delete workspace"
        description={
          workspaceToDelete
            ? `Delete ${workspaceToDelete.name}? Workspace-scoped agents and calls tied to this prototype surface will no longer be accessible here.`
            : "Delete this workspace? This action cannot be undone."
        }
        confirmLabel="Delete workspace"
        isOpen={Boolean(workspaceToDelete)}
        isPending={rowAction.pendingKey === `delete:${workspaceToDelete?.workspace_id ?? ""}`}
        onClose={() => setWorkspaceToDelete(null)}
        onConfirm={() => {
          if (!workspaceToDelete) {
            return;
          }
          void rowAction.run(`delete:${workspaceToDelete.workspace_id}`, async () => {
            await withPagePending(`Deleting ${workspaceToDelete.name}...`, () =>
              removeWorkspace(workspaceToDelete)
            );
            setWorkspaceToDelete(null);
          });
        }}
      />
    </div>
  );
}
