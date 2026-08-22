"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMockApp } from "@/lib/mock-app";
import { api } from "@/lib/api-client";
import { useAsyncAction, useKeyedAsyncAction } from "@/lib/use-async-action";
import { Badge, Button, Card, ConfirmActionModal, ContentLoader, Input, Modal, PageHeader, Select, SurfaceLoader } from "@/components/ui";

type TeamMember = {
  membership_id: string;
  email: string;
  display_name: string;
  role: "admin" | "editor" | "viewer";
};

export default function TeamPage() {
  const { tenantSlug, workspaceId } = useMockApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const inviteAction = useAsyncAction();
  const saveAction = useAsyncAction();
  const rowAction = useKeyedAsyncAction();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);

  async function loadMembers(options?: { showLoader?: boolean }) {
    if (options?.showLoader) {
      setIsLoading(true);
    }

    try {
      const items = await api<TeamMember[]>(
        `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members`
      );
      setMembers(items);
    } finally {
      if (options?.showLoader) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadMembers({ showLoader: true });
  }, [tenantSlug, workspaceId]);

  async function withPagePending<T>(message: string, action: () => Promise<T>) {
    setPendingMessage(message);
    try {
      return await action();
    } finally {
      setPendingMessage(null);
    }
  }

  async function inviteMember() {
    setIsOpen(false);
    await api(`/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, display_name: displayName, role }),
    });
    setEmail("");
    setDisplayName("");
    setRole("viewer");
    await loadMembers();
  }

  async function updateRole(membershipId: string, nextRole: TeamMember["role"]) {
    await api(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members/${membershipId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      }
    );
    await loadMembers();
  }

  async function saveMember() {
    if (!editingMember) {
      return;
    }
    await api(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members/${editingMember.membership_id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ display_name: displayName, role }),
      }
    );
    setEditingMember(null);
    setDisplayName("");
    setRole("viewer");
    await loadMembers();
  }

  async function removeMember(membershipId: string) {
    await api(
      `/api/v1/tenants/${tenantSlug}/workspaces/${workspaceId}/members/${membershipId}`,
      {
        method: "DELETE",
      }
    );
    await loadMembers();
  }

  const isMutating = Boolean(pendingMessage);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Team"
        description="Invite admins, editors, and viewers into the current tenant and keep role ownership visible."
        actions={
          <Button onClick={() => setIsOpen(true)}>
            <Plus size={16} />
            Invite member
          </Button>
        }
      />

      {isLoading ? (
        <ContentLoader
          title="Loading team"
          description="Fetching members and role assignments for the current workspace."
        />
      ) : null}

      {!isLoading ? (
      <div className="relative">
        {isMutating ? <SurfaceLoader message={pendingMessage ?? ""} /> : null}
        <Card>
        <div className="space-y-3">
          {members.map((member) => (
            <div key={member.membership_id} className="rounded-2xl border border-border bg-[#fcfcff] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{member.display_name}</p>
                  <p className="mt-1 text-sm text-[#6D6D78]">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={member.role === "admin" ? "success" : member.role === "editor" ? "warning" : "neutral"}>
                    {member.role}
                  </Badge>
                  <Select
                    ariaLabel={`Change role for ${member.display_name}`}
                    disabled={rowAction.pendingKey === `role:${member.membership_id}`}
                    loading={rowAction.pendingKey === `role:${member.membership_id}`}
                    value={member.role}
                    options={["admin", "editor", "viewer"]}
                    onChange={(event) =>
                      void rowAction.run(`role:${member.membership_id}`, () =>
                        updateRole(member.membership_id, event.target.value as TeamMember["role"])
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingMember(member);
                      setDisplayName(member.display_name);
                      setRole(member.role);
                    }}
                  >
                    <Pencil size={16} />
                    Edit
                  </Button>
                  <Button
                    loading={rowAction.pendingKey === `remove:${member.membership_id}`}
                    loadingText="Removing"
                    variant="ghost"
                    onClick={() =>
                      setMemberToRemove({
                        id: member.membership_id,
                        name: member.display_name
                      })
                    }
                  >
                    <Trash2 size={16} />
                    Remove
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
        title="Invite member"
        description="Add a teammate to the current tenant with a lightweight role model for the prototype."
        isOpen={isOpen}
        onClose={() => {
          if (inviteAction.isPending) {
            return;
          }
          setIsOpen(false);
        }}
      >
        <div className="space-y-4">
          <Input label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <Select
            label="Role"
            value={role}
            options={["admin", "editor", "viewer"]}
            onChange={(event) => setRole(event.target.value as "admin" | "editor" | "viewer")}
          />
          <Button
            className="w-full justify-center"
            loading={inviteAction.isPending}
            loadingText="Sending invite"
            onClick={() =>
              void inviteAction.run(() =>
                withPagePending(`Inviting ${displayName || email || "team member"}...`, inviteMember)
              )
            }
          >
            Send invite
          </Button>
        </div>
      </Modal>

      <Modal
        title="Edit member"
        description="Refine role or display label for the current teammate."
        isOpen={Boolean(editingMember)}
        onClose={() => {
          if (saveAction.isPending) {
            return;
          }
          setEditingMember(null);
        }}
      >
        <div className="space-y-4">
          <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <Select
            label="Role"
            value={role}
            options={["admin", "editor", "viewer"]}
            onChange={(event) => setRole(event.target.value as "admin" | "editor" | "viewer")}
          />
          <Button
            className="w-full justify-center"
            loading={saveAction.isPending}
            loadingText="Saving changes"
            onClick={() => void saveAction.run(saveMember)}
          >
            Save changes
          </Button>
        </div>
      </Modal>

      <ConfirmActionModal
        title="Remove member"
        description={
          memberToRemove
            ? `Remove ${memberToRemove.name} from this workspace? Their access will be revoked immediately.`
            : "Remove this member from the workspace? This action cannot be undone."
        }
        confirmLabel="Remove member"
        isOpen={Boolean(memberToRemove)}
        isPending={rowAction.pendingKey === `remove:${memberToRemove?.id ?? ""}`}
        onClose={() => setMemberToRemove(null)}
        onConfirm={() => {
          if (!memberToRemove) {
            return;
          }
          void rowAction.run(`remove:${memberToRemove.id}`, async () => {
            await removeMember(memberToRemove.id);
            setMemberToRemove(null);
          });
        }}
      />
    </div>
  );
}
