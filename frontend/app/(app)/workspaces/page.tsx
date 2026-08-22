"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { Badge, Button, Card, Input, Modal, PageHeader } from "@/components/ui";

type WorkspaceRecord = {
  workspace_id: string;
  name: string;
  is_default: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8100";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export default function WorkspacesPage() {
  const { tenantSlug, workspaceId, workspaceName, reloadWorkspaceContext } = useMockApp();
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceRecord | null>(null);
  const [name, setName] = useState("");

  async function loadWorkspaces() {
    setWorkspaces(await request(`/api/v1/tenants/${tenantSlug}/workspaces`));
  }

  useEffect(() => {
    void loadWorkspaces();
  }, [tenantSlug]);

  async function createWorkspace() {
    setIsOpen(false);
    await request(`/api/v1/tenants/${tenantSlug}/workspaces`, {
      method: "POST",
      body: JSON.stringify({ name, is_default: false }),
    });
    setName("");
    await loadWorkspaces();
  }

  async function saveWorkspace() {
    if (!editingWorkspace) {
      return;
    }
    await request(`/api/v1/tenants/${tenantSlug}/workspaces/${editingWorkspace.workspace_id}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    setEditingWorkspace(null);
    setName("");
    await loadWorkspaces();
    if (editingWorkspace.workspace_id === workspaceId) {
      await reloadWorkspaceContext(editingWorkspace.workspace_id);
    }
  }

  async function makeDefault(nextWorkspace: WorkspaceRecord) {
    await request(`/api/v1/tenants/${tenantSlug}/workspaces/${nextWorkspace.workspace_id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_default: true }),
    });
    await loadWorkspaces();
    await reloadWorkspaceContext(nextWorkspace.workspace_id);
  }

  async function removeWorkspace(nextWorkspace: WorkspaceRecord) {
    await request(`/api/v1/tenants/${tenantSlug}/workspaces/${nextWorkspace.workspace_id}`, {
      method: "DELETE",
    });
    await loadWorkspaces();
    await reloadWorkspaceContext();
  }

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
                    <Button variant="secondary" onClick={() => void makeDefault(workspace)}>
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
                    onClick={() => void removeWorkspace(workspace)}
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

      <Modal
        title="Create workspace"
        description="Add another tenant workspace without changing the current default context."
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      >
        <div className="space-y-4">
          <Input label="Workspace name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button className="w-full justify-center" onClick={() => void createWorkspace()}>
            Save workspace
          </Button>
        </div>
      </Modal>

      <Modal
        title="Rename workspace"
        description="Keep workspace naming clear while preserving the current tenant structure."
        isOpen={Boolean(editingWorkspace)}
        onClose={() => setEditingWorkspace(null)}
      >
        <div className="space-y-4">
          <Input label="Workspace name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button className="w-full justify-center" onClick={() => void saveWorkspace()}>
            Save changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
